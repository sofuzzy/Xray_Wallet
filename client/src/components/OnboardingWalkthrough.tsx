import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Wallet, 
  ArrowRightLeft, 
  Shield, 
  Key, 
  Compass,
  ChevronRight,
  ChevronLeft,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WALKTHROUGH_KEY = "xray_walkthrough_completed";

export function hasCompletedWalkthrough(): boolean {
  return localStorage.getItem(WALKTHROUGH_KEY) === "true";
}

export function setWalkthroughCompleted(): void {
  localStorage.setItem(WALKTHROUGH_KEY, "true");
}

interface WalkthroughStep {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight?: string;
}

const steps: WalkthroughStep[] = [
  {
    icon: <Sparkles className="w-12 h-12 text-primary" />,
    title: "Welcome to XRAY Wallet",
    description: "Your secure, non-custodial Solana wallet. Let's walk you through the key features to get you started.",
    highlight: "Takes less than a minute",
  },
  {
    icon: <Key className="w-12 h-12 text-primary" />,
    title: "Create Your PIN",
    description: "Your wallet is protected by a PIN that encrypts everything locally on your device. Your keys never leave your device - this is what makes XRAY non-custodial.",
    highlight: "Remember your PIN - it cannot be recovered",
  },
  {
    icon: <Wallet className="w-12 h-12 text-primary" />,
    title: "Your Wallet Dashboard",
    description: "View your SOL balance, send and receive tokens, and manage multiple wallets. Click the wallet icon in the header to switch between wallets.",
    highlight: "Tap 'Receive' to get your wallet address",
  },
  {
    icon: <ArrowRightLeft className="w-12 h-12 text-primary" />,
    title: "Swap Tokens",
    description: "Swap any Solana token using Jupiter aggregation. Search for tokens by name or paste a mint address. We find the best rates across all DEXs.",
    highlight: "Click 'Swap' on the main screen",
  },
  {
    icon: <Compass className="w-12 h-12 text-primary" />,
    title: "Explore Tokens",
    description: "Discover trending tokens and view live charts powered by DexScreener. Find new opportunities and track your favorites.",
    highlight: "Visit the Explore page",
  },
  {
    icon: <Shield className="w-12 h-12 text-primary" />,
    title: "Back Up Your Wallet",
    description: "Your seed phrase is the only way to recover your wallet. Go to Settings and write down your 12-word recovery phrase in a safe place.",
    highlight: "Settings > View Seed Phrase",
  },
];

interface OnboardingWalkthroughProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingWalkthrough({ open, onComplete }: OnboardingWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setWalkthroughCompleted();
    onComplete();
  };

  const handleSkip = () => {
    setWalkthroughCompleted();
    onComplete();
  };

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md border-primary/20"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="relative">
          <div className="flex justify-between items-center mb-6">
            <Badge variant="outline" className="font-mono text-xs">
              {currentStep + 1} / {steps.length}
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSkip}
              className="text-muted-foreground text-xs"
              data-testid="button-skip-walkthrough"
            >
              Skip tour
            </Button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex justify-center">
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                  {step.icon}
                </div>
              </div>

              <div className="text-center space-y-3">
                <h2 className="text-xl font-bold">{step.title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
                {step.highlight && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {step.highlight}
                  </Badge>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-center gap-1.5 my-6">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentStep 
                    ? "bg-primary w-6" 
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
                data-testid={`walkthrough-dot-${index}`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={isFirstStep}
              className="flex-1"
              data-testid="button-walkthrough-prev"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1"
              data-testid="button-walkthrough-next"
            >
              {isLastStep ? "Get Started" : "Next"}
              {!isLastStep && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
