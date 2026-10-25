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
