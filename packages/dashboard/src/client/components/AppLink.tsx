import { createLink, type LinkComponent } from "@tanstack/react-router";
import * as React from "react";

const BasicLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>((props, ref) => <a ref={ref} {...props} />);

const CreatedLink = createLink(BasicLinkComponent);

export const AppLink: LinkComponent<typeof BasicLinkComponent> = (props) => (
  <CreatedLink preload="intent" {...props} />
);
