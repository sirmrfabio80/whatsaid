import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS } from "@/lib/pricing";
import { CreditCard, Check, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Credits() {
  const { user, loading: authLoading, creditBalance } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  if (authLoading || !user) return null;

  const handleBuyPack = (packIndex: number) => {
    console.log("Buy pack:", CREDIT_PACKS[packIndex]);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold mb-2">Your Credits</h1>
            <div className="inline-flex items-center gap-2 mt-4 px-5 py-3 rounded-xl bg-primary/10">
              <CreditCard className="w-5 h-5 text-primary" />
              <span className="font-heading text-2xl font-bold">{creditBalance}</span>
              <span className="text-muted-foreground">credits remaining</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {CREDIT_PACKS.map((pack, i) => (
              <Card
                key={pack.label}
                className={`relative overflow-hidden rounded-xl shadow-sm transition-all hover:shadow-md ${
                  i === 1 ? "border-primary shadow-md ring-1 ring-primary/20" : "border-border/50"
                }`}
              >
                {i === 1 && (
                  <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-bl-xl">
                    Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="font-heading text-xl">{pack.label}</CardTitle>
                  <CardDescription>{pack.credits} credits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="font-heading text-3xl font-bold">${pack.price}</span>
                    <span className="text-muted-foreground text-sm ml-1">one-time</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ${pack.perCredit.toFixed(2)} per credit
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" />No expiry</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" />Job history</li>
                    <li className="flex items-center gap-2"><Check className="w-4 h-4 text-success" />Extra regenerations</li>
                  </ul>
                  <Button className="w-full rounded-xl" variant={i === 1 ? "default" : "outline"} onClick={() => handleBuyPack(i)}>
                    <Zap className="w-4 h-4 mr-1.5" />
                    Buy {pack.credits} credits
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>1 credit = up to 15 min of audio · 2 credits = 15-30 min · 3 credits = 30-45 min · 4 credits = 45-60 min</p>
          </div>
        </div>
      </div>
    </div>
  );
}
