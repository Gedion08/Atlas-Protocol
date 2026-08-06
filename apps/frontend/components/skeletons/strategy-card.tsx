import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function StrategyCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-12 animate-pulse rounded bg-muted/40" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
