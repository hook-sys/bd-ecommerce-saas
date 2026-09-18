import { describe, it, expect } from "vitest";
import { renderSection, COMPONENT_REGISTRY } from "@/lib/storefront/component-registry";

describe("component registry — controlled, fails safe on unknown components", () => {
  it("has every approved platform component the contract can reference", () => {
    expect(Object.keys(COMPONENT_REGISTRY).sort()).toEqual(
      ["Banner", "CategoryGrid", "FAQ", "Footer", "Header", "Hero", "Newsletter", "ProductGrid", "Testimonials"].sort()
    );
  });

  it("renders a known component", () => {
    const element = renderSection({ component: "Hero", props: { heading: "Welcome" } }, 0);
    expect(element).not.toBeNull();
  });

  it("renders nothing (fails safe) for a component name that isn't in the registry", () => {
    const element = renderSection({ component: "ArbitraryUploadedWidget", props: {} }, 0);
    expect(element).toBeNull();
  });

  it("fails safe even when the unknown component name looks like an attempt at script injection", () => {
    const element = renderSection({ component: "<script>alert(1)</script>", props: {} }, 0);
    expect(element).toBeNull();
  });
});
