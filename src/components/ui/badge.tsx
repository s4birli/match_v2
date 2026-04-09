import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "border border-white/10 bg-white/[0.08] text-foreground",
        success: "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
        warning: "border border-amber-400/20 bg-amber-400/10 text-amber-200",
        danger: "border border-red-400/20 bg-red-400/10 text-red-200",
        info: "border border-blue-400/20 bg-blue-400/10 text-blue-200",
        accent: "border border-violet-400/20 bg-violet-400/10 text-violet-200",
        red: "border border-red-400/20 bg-red-400/10 text-red-200",
        blue: "border border-blue-400/20 bg-blue-400/10 text-blue-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
