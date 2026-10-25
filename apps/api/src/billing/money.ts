// Bill arithmetic in integer paise (BigInt), following docs/billing-rules.md. Nothing here ever
// passes through floating point.

/** Tax on a taxable amount at `bp` basis points (1800 is 18%), rounded half up to the paisa. */
export function taxPaise(taxablePaise: bigint, bp: number): bigint {
  if (taxablePaise < 0n) throw new Error('Taxable amounts are never negative');
  return (taxablePaise * BigInt(bp) + 5_000n) / 10_000n;
}

/** CGST and SGST, half each. An odd paisa goes to CGST. */
export function splitGst(taxPaise: bigint): { cgstPaise: bigint; sgstPaise: bigint } {
  const sgstPaise = taxPaise / 2n;
  return { cgstPaise: taxPaise - sgstPaise, sgstPaise };
}

/** The nearest whole rupee; exactly 50 paise rounds up. `roundOffPaise` is what was added (-49 to +50). */
export function roundToRupee(paise: bigint): { roundedPaise: bigint; roundOffPaise: bigint } {
  if (paise < 0n) throw new Error('Bill totals are never negative');
  const roundedPaise = ((paise + 50n) / 100n) * 100n;
  return { roundedPaise, roundOffPaise: roundedPaise - paise };
}

export interface LineInput {
  unitRatePaise: bigint;
  quantity: number;
  taxRateBp: number;
  discountPaise?: bigint;
}

export interface LineAmounts {
  amountPaise: bigint;
  discountPaise: bigint;
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  totalPaise: bigint;
}

/** One bill line: amount, less any discount, then tax on what is left. */
export function lineAmounts({ unitRatePaise, quantity, taxRateBp, discountPaise = 0n }: LineInput): LineAmounts {
  const amountPaise = unitRatePaise * BigInt(quantity);
  if (discountPaise < 0n || discountPaise > amountPaise) throw new Error('A discount is between nothing and the whole line');
  const taxablePaise = amountPaise - discountPaise;
  const { cgstPaise, sgstPaise } = splitGst(taxPaise(taxablePaise, taxRateBp));
  return { amountPaise, discountPaise, taxablePaise, cgstPaise, sgstPaise, totalPaise: taxablePaise + cgstPaise + sgstPaise };
}

export interface BillAmounts {
  lines: LineAmounts[];
  subtotalPaise: bigint;
  discountPaise: bigint;
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  roundOffPaise: bigint;
  totalPaise: bigint;
}

/** A whole bill: line totals added up, then the total rounded to the rupee with a round-off line. */
export function billAmounts(inputs: readonly LineInput[]): BillAmounts {
  const lines = inputs.map(lineAmounts);
  const sum = (pick: (line: LineAmounts) => bigint) => lines.reduce((total, line) => total + pick(line), 0n);
  const taxablePaise = sum((line) => line.taxablePaise);
  const cgstPaise = sum((line) => line.cgstPaise);
  const sgstPaise = sum((line) => line.sgstPaise);
  const { roundedPaise, roundOffPaise } = roundToRupee(taxablePaise + cgstPaise + sgstPaise);
  return {
    lines,
    subtotalPaise: sum((line) => line.amountPaise),
    discountPaise: sum((line) => line.discountPaise),
    taxablePaise,
    cgstPaise,
    sgstPaise,
    roundOffPaise,
    totalPaise: roundedPaise,
  };
}

/** A percentage in basis points (1000 is 10%) of an amount, rounded half up to the paisa. */
export function percentOf(amountPaise: bigint, bp: number): bigint {
  return (amountPaise * BigInt(bp) + 5_000n) / 10_000n;
}

/**
 * A whole-bill discount shared across lines in proportion to their amounts (docs/billing-rules.md).
 * Each share is rounded down and the paise left over go to the largest line. Only when that line has
 * no room left (tiny lines) does the rest move on to the next largest.
 */
export function spreadDiscount(amounts: readonly bigint[], discountPaise: bigint): bigint[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);
  if (discountPaise < 0n || discountPaise > total) throw new Error('A discount is between nothing and the whole bill');
  if (total === 0n) return amounts.map(() => 0n);
  const shares = amounts.map((amount) => (amount * discountPaise) / total);
  let left = discountPaise - shares.reduce((sum, share) => sum + share, 0n);
  const byAmount = amounts
    .map((amount, index) => ({ amount, index }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : a.index - b.index));
  for (const { amount, index } of byAmount) {
    if (left === 0n) break;
    const share = shares[index] ?? 0n;
    const room = amount - share;
    const take = room < left ? room : left;
    shares[index] = share + take;
    left -= take;
  }
  return shares;
}

export interface CreditableLine {
  quantity: number;
  taxRateBp: number;
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  /** What earlier credit notes already gave back on this line. */
  creditedTaxablePaise: bigint;
  creditedCgstPaise: bigint;
  creditedSgstPaise: bigint;
}

export interface CreditAmounts {
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  totalPaise: bigint;
}

/**
 * What a credit note gives back on one bill line, for a number of units or a taxable amount. Tax is
 * reversed at the line's own rate. Crediting all that is left of a line gives back all its tax that
 * is left, so a line credited in parts never gains or loses a paisa. Null when the ask is more than
 * is left on the line.
 */
export function creditLine(line: CreditableLine, ask: { quantity: number } | { amountPaise: bigint }): CreditAmounts | null {
  const leftTaxable = line.taxablePaise - line.creditedTaxablePaise;
  let taxablePaise: bigint;
  if ('quantity' in ask) {
    if (ask.quantity <= 0 || ask.quantity > line.quantity) return null;
    const units = BigInt(line.quantity);
    // The line's taxable value for that many units, rounded half up.
    taxablePaise = (2n * line.taxablePaise * BigInt(ask.quantity) + units) / (2n * units);
    if (taxablePaise > leftTaxable) taxablePaise = leftTaxable;
  } else {
    taxablePaise = ask.amountPaise;
  }
  if (taxablePaise <= 0n || taxablePaise > leftTaxable) return null;
  const leftCgst = line.cgstPaise - line.creditedCgstPaise;
  const leftSgst = line.sgstPaise - line.creditedSgstPaise;
  let cgstPaise = leftCgst;
  let sgstPaise = leftSgst;
  if (taxablePaise < leftTaxable) {
    const split = splitGst(taxPaise(taxablePaise, line.taxRateBp));
    cgstPaise = split.cgstPaise < leftCgst ? split.cgstPaise : leftCgst;
    sgstPaise = split.sgstPaise < leftSgst ? split.sgstPaise : leftSgst;
  }
  return { taxablePaise, cgstPaise, sgstPaise, totalPaise: taxablePaise + cgstPaise + sgstPaise };
}

/**
 * A credit note's total, rounded to the rupee like a bill. The note that clears the bill takes
 * exactly what is left of the bill total, so all of a bill's credit notes add up to it. Null when
 * the note would round to nothing.
 */
export function creditNoteTotal(
  exactPaise: bigint,
  billTotalPaise: bigint,
  creditedBeforePaise: bigint,
  clearsBill: boolean,
): { totalPaise: bigint; roundOffPaise: bigint } | null {
  const left = billTotalPaise - creditedBeforePaise;
  let totalPaise = clearsBill ? left : roundToRupee(exactPaise).roundedPaise;
  if (totalPaise > left) totalPaise = left;
  if (totalPaise <= 0n) return null;
  return { totalPaise, roundOffPaise: totalPaise - exactPaise };
}
