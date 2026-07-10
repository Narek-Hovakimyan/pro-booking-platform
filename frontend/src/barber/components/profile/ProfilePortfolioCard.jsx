import { Camera } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";

export default function ProfilePortfolioCard({ portfolioCount }) {
  return (
    <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-lg">
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-6 py-4">
        <h2 className="font-bold text-white">Portfolio</h2>
      </div>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-500">
          {portfolioCount && portfolioCount > 0
            ? `${portfolioCount} portfolio item${portfolioCount === 1 ? "" : "s"} ready for clients.`
            : "No portfolio items yet."}
        </p>
        <Button as={Link} to="/admin/portfolio" variant="outline">
          <Camera className="mr-2 h-4 w-4" />
          Manage portfolio
        </Button>
      </CardContent>
    </Card>
  );
}