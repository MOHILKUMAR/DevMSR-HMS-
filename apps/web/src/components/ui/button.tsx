import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// One primary button per screen (section 16); other actions use outline or ghost.
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        outline: 'border border-border bg-surface text-text hover:bg-primary-soft',
        ghost: 'text-text hover:bg-primary-soft',
        // Surface colour as text: white on red in light theme, dark on light red in dark theme.
        danger: 'bg-danger text-surface hover:opacity-90',
      },
      size: {
        // 40px high with 16px text, as billing counter controls need.
        md: 'h-10 px-4 text-base',
        sm: 'h-8 px-3 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
