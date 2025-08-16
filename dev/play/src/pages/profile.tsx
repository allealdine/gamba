"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Copy, ExternalLink, RefreshCw, Wallet, X } from 'lucide-react';
import {
  TokenValue,
  useCurrentToken,
  useReferral,
  useTokenBalance,
} from "gamba-react-ui-v2";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM_REFERRAL_FEE } from "@/constants";
import { PublicKey } from "@solana/web3.js";
import type React from "react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const Profile: React.FC = () => {
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const {
    referrerAddress,
    isOnChain,
    referralStatus,
    referralLink,
    copyLinkToClipboard,
    acceptInvite,
    removeInvite,
    acceptInviteOnNextPlay,
    clearCache,
  } = useReferral();

  const { balance, bonusBalance } = useTokenBalance();
  const currentToken = useCurrentToken();

  const [newReferrer, setNewReferrer] = useState("");
  const [copied, setCopied] = useState(false);

  const connect = () => {
    if (wallet.wallet) {
      wallet.connect();
    } else {
      walletModal.setVisible(true);
    }
  };

  const handleCopyInvite = () => {
    copyLinkToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(
      `Copied! Share your link to earn a ${
        PLATFORM_REFERRAL_FEE * 100
      }% fee when players use this platform`
    );
  };

  const handleAcceptInvite = async () => {
    try {
      await acceptInvite(new PublicKey(newReferrer));
      toast.success("Invite accepted successfully!");
      setNewReferrer("");
    } catch (error) {
      toast.error("Failed to accept invite. Please try again.");
    }
  };

  const handleRemoveInvite = async () => {
    try {
      await removeInvite();
      toast.success("Referrer removed successfully!");
    } catch (error) {
      toast.error("Failed to remove referrer. Please try again.");
    }
  };

  const handleAcceptInviteOnNextPlay = async () => {
    try {
      await acceptInviteOnNextPlay(new PublicKey(newReferrer));
      toast.success("Invite will be accepted on your next play!");
      setNewReferrer("");
    } catch (error) {
      toast.error("Failed to set invite for next play. Please try again.");
    }
  };

  const handleClearCache = () => {
    clearCache();
    toast.success("Local referral cache cleared.");
  };

  const truncateString = (s: string, startLen = 4, endLen = startLen) =>
    s ? `${s.slice(0, startLen)}...${s.slice(-endLen)}` : "";

  if (!wallet.connected) {
    return (
      <section className="py-12 px-4 md:px-0">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Connect Your Wallet</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-center text-muted-foreground">
              Connect your wallet to view your profile, manage referrals, and
              track your earnings.
            </p>
            <Button onClick={connect} size="lg">
              {wallet.connecting ? "Connecting..." : "Connect Wallet"}
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="py-12 px-4 md:px-0">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl font-bold">Profile Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-secondary p-2 rounded-full">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">
                  {wallet.publicKey &&
                    truncateString(wallet.publicKey.toString(), 8, 8)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Connected with {wallet.wallet?.adapter.name}
                </p>
              </div>
            </div>
            <Button variant="outline" asChild className="w-full md:w-auto">
              <a
                href={`https://solscan.io/account/${wallet.publicKey?.toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center"
              >
                View on Solscan
                <ExternalLink className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Balance</h3>
              <p className="text-2xl font-bold">
                <TokenValue amount={balance} />
              </p>
              <p className="text-sm text-muted-foreground">
                {currentToken.symbol}
              </p>
            </div>
            {bonusBalance > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Bonus Balance</h3>
                <p className="text-2xl font-bold text-green-500">
                  <TokenValue amount={bonusBalance} />
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-2">Your Referral Link</h3>
            <div className="flex flex-col md:flex-row items-stretch md:items-center space-y-2 md:space-y-0 md:space-x-2">
              <Input value={referralLink || ""} readOnly className="grow" />
              <Button onClick={handleCopyInvite} variant="outline" className="md:w-auto">
                {copied ? (
                  <Check className="h-4 w-4 mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Share your link to earn a {PLATFORM_REFERRAL_FEE * 100}% fee on each
              play
            </p>
            <div className="mt-2">
              <Badge variant={isOnChain ? "default" : "secondary"}>
                Status: {referralStatus}
                {isOnChain && " (On-chain)"}
              </Badge>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-2">
              {referrerAddress ? "Current Referrer" : "Accept Referral"}
            </h3>
            {referrerAddress ? (
              <>
                <p className="mb-4">
                  <span className="font-medium">
                    {truncateString(referrerAddress.toString(), 8, 8)}
                  </span>{" "}
                  earns a{" "}
                  <span className="font-bold">
                    {PLATFORM_REFERRAL_FEE * 100}%
                  </span>{" "}
                  fee on each play
                </p>
                <div className="flex space-x-2">
                  {isOnChain ? (
                    <Button onClick={handleRemoveInvite} variant="destructive">
                      <X className="h-4 w-4 mr-2" />
                      Remove Referrer
                    </Button>
                  ) : (
                    <Button onClick={handleClearCache} variant="outline">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Clear Local Referrer
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col space-y-2">
                <Label htmlFor="referrer">Referrer&apos;s Public Key</Label>
                <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
                  <Input
                    id="referrer"
                    value={newReferrer}
                    onChange={(e) => setNewReferrer(e.target.value)}
                    placeholder="Enter referrer's public key"
                    className="grow"
                  />
                  <Button onClick={handleAcceptInvite} disabled={!newReferrer} className="md:w-auto">
                    Accept Now
                  </Button>
                </div>
                <Button
                  onClick={handleAcceptInviteOnNextPlay}
                  disabled={!newReferrer}
                  variant="outline"
                  className="w-full md:w-auto"
                >
                  Accept on Next Play
                </Button>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-semibold mb-2">Advanced Options</h3>
            <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
              <Button onClick={handleClearCache} variant="outline" className="w-full md:w-auto">
                Clear Local Cache
              </Button>
              {referralStatus === "local" && (
                <Button onClick={handleAcceptInvite} variant="outline" className="w-full md:w-auto">
                  Confirm On-Chain
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default Profile;

