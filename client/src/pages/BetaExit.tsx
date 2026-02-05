import { FlaskConical, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BetaExit() {
  const handleGoBack = () => {
    localStorage.removeItem("XRAY_BETA_ACK");
    localStorage.removeItem("XRAY_BETA_ACK_AT");
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
            <FlaskConical className="w-8 h-8 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">Xray is in Beta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-muted-foreground">
            Thank you for your interest in Xray. Our app is currently in beta testing, which means some features may be incomplete or contain bugs.
          </p>

          <p className="text-center text-muted-foreground">
            We appreciate your patience as we work to improve the experience. If you have questions or feedback, please reach out to our team.
          </p>

          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">Need Help?</p>
                <a 
                  href="mailto:support@xray.app" 
                  className="text-sm text-primary hover:underline"
                  data-testid="link-support-email"
                >
                  support@xray.app
                </a>
              </div>
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full"
            onClick={handleGoBack}
            data-testid="button-go-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back to Xray
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
