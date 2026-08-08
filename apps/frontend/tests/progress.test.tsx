import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "@/components/ui/progress";

describe("Progress", () => {
  it("renders with clamped width", () => {
    const { container } = render(<Progress value={150} />);
    const fill = container.querySelector("[class*='h-full']");
    expect(fill).toBeTruthy();
    expect(fill).toHaveStyle({ width: "100%" });
  });

  it("clamps negative values to 0", () => {
    const { container } = render(<Progress value={-10} />);
    const fill = container.querySelector("[class*='h-full']");
    expect(fill).toBeTruthy();
    expect(fill).toHaveStyle({ width: "0%" });
  });

  it("applies custom className", () => {
    const { container } = render(<Progress value={50} className="custom" />);
    const outer = container.firstElementChild;
    expect(outer?.className).toContain("custom");
  });
});
