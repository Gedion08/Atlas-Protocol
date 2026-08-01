import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

describe("ui primitives", () => {
  it("renders a positive badge", () => {
    render(<Badge variant="positive">79</Badge>);
    expect(screen.getByText("79")).toBeInTheDocument();
    expect(screen.getByText("79").className).toContain("text-positive");
  });

  it("renders a destructive badge", () => {
    render(<Badge variant="destructive">paused</Badge>);
    expect(screen.getByText("paused")).toBeInTheDocument();
  });

  it("renders progress with clamped width", () => {
    const { container } = render(<Progress value={150} />);
    const fill = container.querySelector("[class*='h-full']");
    expect(fill).toBeTruthy();
    expect(fill).toHaveStyle({ width: "100%" });
  });

  it("renders buttons with variants", () => {
    render(<Button variant="outline">Connect</Button>);
    const button = screen.getByRole("button", { name: "Connect" });
    expect(button.className).toContain("border");
  });
});
