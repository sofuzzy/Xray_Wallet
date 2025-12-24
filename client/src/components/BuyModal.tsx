import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Loader2, Apple, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BuyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function CheckoutForm({ 
  amount, 
  solAmount, 
  onSuccess, 
  onCancel 
}: { 
  amount: number; 
  solAmount: number;
  onSuccess: () => void; 
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: "if_required",
      });

      if (error) {
        toast({
          title: "Payment Failed",
          description: error.message || "Something went wrong",
          variant: "destructive",
        });
      } else if (paymentIntent?.status === "succeeded") {
        setIsComplete(true);
        toast({
          title: "Payment Successful",
          description: `You purchased ${solAmount.toFixed(4)} SOL`,
        });
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err: any) {
      toast({
        title: "Payment Error",
        description: err.message || "Failed to process payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-xl font-semibold text-white">Payment Complete</h3>
        <p className="text-muted-foreground text-center">
          {solAmount.toFixed(4)} SOL will be added to your wallet
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium">${(amount / 100).toFixed(2)} USD</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">You will receive</span>
          <span className="font-medium text-primary">{solAmount.toFixed(4)} SOL</span>
        </div>
      </div>

      <div className="space-y-3">
        <PaymentElement 
          options={{
            layout: "tabs",
            wallets: {
              applePay: "auto",
              googlePay: "auto",
            },
          }}
        />
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
          disabled={isProcessing}
          data-testid="button-cancel-payment"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!stripe || isProcessing}
          data-testid="button-confirm-payment"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4 mr-2" />
              Pay ${(amount / 100).toFixed(2)}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export function BuyModal({ isOpen, onClose }: BuyModalProps) {
  const [step, setStep] = useState<"amount" | "payment">("amount");
  const [usdAmount, setUsdAmount] = useState("10");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<any>(null);
  const { toast } = useToast();

  // Fetch Stripe publishable key
  const { data: stripeConfig } = useQuery({
    queryKey: ["/api/stripe/publishable-key"],
    enabled: isOpen,
  });

  // Fetch SOL price
  const { data: solPriceData } = useQuery({
    queryKey: ["/api/stripe/sol-price"],
    enabled: isOpen,
  });

  const solPrice = solPriceData?.price || 175.50;

  // Create payment intent mutation
  const createPaymentIntent = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", "/api/stripe/create-payment-intent", { amount });
      return res;
    },
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
      setStep("payment");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to initialize payment",
        variant: "destructive",
      });
    },
  });

  // Initialize Stripe when publishable key is available
  useEffect(() => {
    if (stripeConfig?.publishableKey) {
      setStripePromise(loadStripe(stripeConfig.publishableKey));
    }
  }, [stripeConfig?.publishableKey]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep("amount");
      setUsdAmount("10");
      setClientSecret(null);
    }
  }, [isOpen]);

  const handleContinue = () => {
    const amount = Math.round(parseFloat(usdAmount) * 100); // Convert to cents
    if (amount < 100) {
      toast({
        title: "Invalid Amount",
        description: "Minimum purchase is $1.00",
        variant: "destructive",
      });
      return;
    }
    createPaymentIntent.mutate(amount);
  };

  const amountCents = Math.round(parseFloat(usdAmount || "0") * 100);
  const solAmount = parseFloat(usdAmount || "0") / solPrice;

  const presetAmounts = [10, 25, 50, 100];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full max-w-md"
        >
          <Card className="p-6 bg-card/95 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Apple className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white" data-testid="heading-buy-sol">
                    Buy SOL
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {step === "amount" ? "Choose amount" : "Complete payment"}
                  </p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                data-testid="button-close-buy-modal"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {step === "amount" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="amount">Amount (USD)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min="1"
                    step="0.01"
                    value={usdAmount}
                    onChange={(e) => setUsdAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="text-lg"
                    data-testid="input-buy-amount"
                  />
                  
                  <div className="flex gap-2">
                    {presetAmounts.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setUsdAmount(preset.toString())}
                        className={usdAmount === preset.toString() ? "border-primary" : ""}
                        data-testid={`button-preset-${preset}`}
                      >
                        ${preset}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">SOL Price</span>
                    <span>${solPrice.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">You will receive</span>
                    <span className="font-semibold text-primary" data-testid="text-sol-amount">
                      {solAmount.toFixed(4)} SOL
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleContinue}
                  className="w-full"
                  disabled={createPaymentIntent.isPending || !stripeConfig?.publishableKey}
                  data-testid="button-continue-to-payment"
                >
                  {createPaymentIntent.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Continue to Payment
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Supports Apple Pay, Google Pay, and credit cards
                </p>
              </div>
            )}

            {step === "payment" && clientSecret && stripePromise && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "night",
                    variables: {
                      colorPrimary: "#a855f7",
                      colorBackground: "#1a1a2e",
                      colorText: "#ffffff",
                      colorDanger: "#ef4444",
                      fontFamily: "system-ui, sans-serif",
                      borderRadius: "8px",
                    },
                  },
                }}
              >
                <CheckoutForm
                  amount={amountCents}
                  solAmount={solAmount}
                  onSuccess={onClose}
                  onCancel={() => setStep("amount")}
                />
              </Elements>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
