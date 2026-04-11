import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import JobResults from "@/components/JobResults";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  if (!id) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 -ml-2 gap-1.5 text-muted-foreground"
            onClick={() => navigate("/history")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to history
          </Button>
          <JobResults jobId={id} />
        </div>
      </div>
    </div>
  );
}
