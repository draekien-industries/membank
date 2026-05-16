import { cva, type VariantProps } from "class-variance-authority";

export const typeColorVariants = cva("", {
  variants: {
    type: {
      correction: "",
      preference: "",
      decision: "",
      learning: "",
      fact: "",
    },
    tone: {
      text: "",
      bg: "",
    },
  },
  compoundVariants: [
    { type: "correction", tone: "text", class: "text-correction" },
    { type: "preference", tone: "text", class: "text-preference" },
    { type: "decision", tone: "text", class: "text-decision" },
    { type: "learning", tone: "text", class: "text-learning" },
    { type: "fact", tone: "text", class: "text-fact" },
    { type: "correction", tone: "bg", class: "bg-correction" },
    { type: "preference", tone: "bg", class: "bg-preference" },
    { type: "decision", tone: "bg", class: "bg-decision" },
    { type: "learning", tone: "bg", class: "bg-learning" },
    { type: "fact", tone: "bg", class: "bg-fact" },
  ],
  defaultVariants: { tone: "text" },
});

export type TypeColorVariants = VariantProps<typeof typeColorVariants>;
