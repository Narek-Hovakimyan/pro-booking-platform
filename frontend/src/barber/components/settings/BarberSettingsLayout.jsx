import { Card, CardContent } from "@/shared/components/ui/card";

export default function BarberSettingsLayout({ children, confirmation }) {
  return (
    <Card className="rounded-2xl sm:rounded-3xl lg:col-span-3">
      <CardContent className="space-y-5 p-4 sm:p-6">
        {children}
      </CardContent>

      {confirmation}
    </Card>
  );
}
