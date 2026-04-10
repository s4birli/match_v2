import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-emerald-400 to-emerald-600 text-emerald-950 shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-emerald-500",
        secondary:
          "border border-slate-200/80 dark:border-white/10 bg-slate-100 dark:bg-white/[0.06] text-foreground hover:bg-white/[0.1]",
        outline:
          "border border-slate-200 dark:border-white/15 bg-transparent text-foreground hover:bg-slate-200/70 dark:hover:bg-white/[0.06]",
        ghost: "text-foreground hover:bg-slate-200/70 dark:hover:bg-white/[0.06]",
        destructive:
          "bg-red-500/90 text-white hover:bg-red-500 shadow-lg shadow-red-500/20",
        accent:
          "bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20 hover:from-violet-400 hover:to-fuchsia-500",
        link: "text-emerald-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-xl px-3 text-xs",
        lg: "h-12 rounded-2xl px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
