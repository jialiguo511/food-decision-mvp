"use client";

import { ORDER_METHODS } from "@/lib/options";
import type { OrderMethod } from "@/lib/types";

/** Get food results: change how you're getting it in one tap. Everything else you said (hunger,
 *  craving, budget, distance) is kept and the same request is sent with the new method. Pickup and
 *  Eat nearby look up real places (location, once); Delivery suggests what to search for. No prices
 *  or fees are compared here: we have no verified delivery-fee data. */
export default function MethodSwitch({ value, disabled, onSwitch }: { value: OrderMethod; disabled?: boolean; onSwitch: (method: OrderMethod) => void }) {
  return (
    <div role="radiogroup" aria-label="How you're getting food" className="grid grid-cols-3 gap-1 rounded-2xl bg-line/50 p-1">
      {ORDER_METHODS.map((m) => {
        const on = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onSwitch(m.value)}
            className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors disabled:opacity-60 ${on ? "bg-card text-ink shadow-sm" : "text-muted"}`}
          >
            {SHORT[m.value]}
          </button>
        );
      })}
    </div>
  );
}

const SHORT: Record<OrderMethod, string> = { delivery: "Delivery", pickup: "Pickup", eat_nearby: "Eat nearby" };
