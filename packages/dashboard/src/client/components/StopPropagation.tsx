import type { ReactNode } from "react";

/**
 * Stops click/keydown events from reaching an ancestor (e.g. a card-wide link).
 *
 * `preventDefault` additionally cancels the native default action. Enable it when
 * the wrapped controls sit *inside* an `<a>` in the DOM, where stopping propagation
 * alone still lets the browser follow the link. Leave it off for portaled content
 * (menus, dialogs) that only reaches the link via React's event tree — preventing
 * default there can break inner controls like selects and submit buttons.
 */
export function StopPropagation({
  children,
  preventDefault = false,
}: {
  children: ReactNode;
  preventDefault?: boolean;
}) {
  return (
    <div
      role="none"
      onClick={(e) => {
        if (preventDefault) e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
