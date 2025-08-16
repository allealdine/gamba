"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChevronDown, ClipboardCopy, LogOut, User } from "lucide-react"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  GambaPlatformContext,
  TokenValue,
  useCurrentPool,
  useCurrentToken,
  useReferral,
  useTokenBalance,
} from "gamba-react-ui-v2"
import { PLATFORM_REFERRAL_FEE, TOKENLIST } from "@/constants"
import React, { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { useUserStore } from "@/hooks/useUserStore"
import { useWallet } from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"

export default function Header() {
  const context = React.useContext(GambaPlatformContext)
  const { connected, publicKey, disconnect, wallet, connecting, connect } = useWallet()
  const walletModal = useWalletModal()
  const pool = useCurrentPool()
  const token = useCurrentToken()
  const balance = useTokenBalance()
  const { referrerAddress, isOnChain, referralStatus, referralLink, copyLinkToClipboard, clearCache } = useReferral()

  const [showBonusHelp, setShowBonusHelp] = useState(false)
  const [showJackpotHelp, setShowJackpotHelp] = useState(false)

  const { isPriorityFeeEnabled, priorityFee, set } = useUserStore()
  const [newPriorityFee, setNewPriorityFee] = useState(priorityFee)

  const handleSetPriorityFee = useCallback(() => {
    try {
      set({ priorityFee: newPriorityFee })
      toast.success(`Priority fee set to ${newPriorityFee}`)
    } catch (error) {
      toast.error("Error setting priority fee")
      console.error("Error setting priority fee:", error)
    }
  }, [newPriorityFee, set])

  const handleSetToken = (token: any) => {
    try {
      if (token && token.poolAuthority) {
        context.setPool(token.mint, token.poolAuthority)
      } else {
        context.setPool(token.mint)
      }
      toast.success(`Token set to ${token.name}`)
    } catch (error) {
      toast.error("Error setting token")
    }
  }

  const copyInvite = () => {
    if (!publicKey) {
      return walletModal.setVisible(true)
    }
    copyLinkToClipboard()
    toast.success(
      `Copied! Share your link to earn a ${PLATFORM_REFERRAL_FEE * 100}% fee when players use this platform`,
    )
  }

  const truncateString = (s: string, startLen = 4, endLen = startLen) =>
    s ? `${s.slice(0, startLen)}...${s.slice(-endLen)}` : ""

  const handleConnect = useCallback(() => {
    walletModal.setVisible(true)
  }, [walletModal])

  return (
    <>
      <div className="flex items-center justify-between w-full p-2.5 fixed top-0 left-0 z-50 rounded-b-2xl bg-background border border-t-0 shadow-lg">
        <div className="absolute top-0 left-0 right-0 backdrop-blur-sm w-full h-full rounded-b-2xl -z-20" />
        <div className="flex gap-5 items-center">
          <Link href="/" passHref>
            <div className="h-9 m-0 cursor-pointer">
              <img alt="Gamba logo" src="/logo.svg" className="h-full" />
            </div>
          </Link>
        </div>
        <div className="max-sm:text-xs max-sm:gap-1 flex gap-2.5 items-center relative">
          <Dialog open={showBonusHelp} onOpenChange={setShowBonusHelp}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>You have a bonus!</DialogTitle>
              </DialogHeader>
              <p>
                You have{" "}
                <b>
                  <TokenValue amount={balance.bonusBalance} />
                </b>{" "}
                worth of free plays. This bonus will be applied automatically when you play.
              </p>
            </DialogContent>
          </Dialog>

          <Dialog open={showJackpotHelp} onOpenChange={setShowJackpotHelp}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{token.name} Jackpot Details</DialogTitle>
              </DialogHeader>
              {pool.jackpotBalance > 0 && (
                <div className="flex text-[#003c00] rounded-lg bg-[#03ffa4] px-2.5 py-0.5 uppercase font-bold">
                  <TokenValue amount={pool.jackpotBalance} />
                </div>
              )}
              <div className="mt-4">
                <p>
                  The Jackpot grows with each game played, funded by fees from unsuccessful attempts to win it. Winning
                  the jackpot not only grants substantial rewards but also recycles a tiny portion of the winnings back
                  into the main liquidity pool, sustaining the games economy.
                </p>
                <div className="mt-4">
                  <div>
                    <strong>Pool Fee:</strong> {pool.poolFee}%
                  </div>
                  <div>
                    <strong>Liquidity:</strong> <TokenValue amount={Number(pool.liquidity)} />
                  </div>
                  <div>
                    <strong>Minimum Wager:</strong> <TokenValue amount={pool.minWager} />
                  </div>
                  <div>
                    <strong>Maximum Payout:</strong> <TokenValue amount={pool.maxPayout} />
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <Button asChild>
                    <a
                      href={`https://explorer.gamba.so/pool/${pool.publicKey.toString()}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Pool on Explorer
                    </a>
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {pool.jackpotBalance > 0 && (
            <button
              onClick={() => setShowJackpotHelp(true)}
              className="hidden md:flex all-unset cursor-pointer text-[#003c00] rounded-lg bg-[#03ffa4] px-2.5 py-0.5 text-xs uppercase font-bold transition-colors duration-200 hover:bg-white"
            >
              <TokenValue amount={pool.jackpotBalance} />
            </button>
          )}
          {balance.bonusBalance > 0 && (
            <button
              onClick={() => setShowBonusHelp(true)}
              className="hidden md:flex all-unset cursor-pointer text-[#003c00] rounded-lg bg-[#03ffa4] px-2.5 py-0.5 text-xs uppercase font-bold transition-colors duration-200 hover:bg-white"
            >
              +<TokenValue amount={balance.bonusBalance} />
            </button>
          )}
          {connected ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <div className="flex items-center gap-2">
                    {token && (
                      <>
                        <img className="w-5 h-5 rounded-full" src={token.image || "/placeholder.svg"} alt="Token" />
                        <TokenValue amount={balance.balance} />
                        {balance.bonusBalance > 0 && (
                          <span className="text-xs">
                            +<TokenValue amount={balance.bonusBalance} />
                          </span>
                        )}
                      </>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </div>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Wallet & Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Connected Wallet</p>
                        <p className="text-xs opacity-70">{truncateString(publicKey?.toString() || "", 8, 8)}</p>
                      </div>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={wallet?.adapter.icon} alt="Wallet Icon" />
                        <AvatarFallback>WL</AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Balance</p>
                      <div className="flex items-center gap-2">
                        <img className="w-8 h-8 rounded-full" src={token.image || "/placeholder.svg"} alt="Token" />
                        <p className="text-2xl font-bold">
                          <TokenValue amount={balance.balance} />
                          {balance.bonusBalance > 0 && (
                            <span className="text-sm ml-1">
                              (+
                              <TokenValue amount={balance.bonusBalance} /> Bonus)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  <ScrollArea className="h-[200px] rounded-md border p-4">
                    <div className="space-y-2">
                      {Object.values(TOKENLIST).map((token, index) => (
                        <button
                          key={index}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg w-full text-left hover:bg-accent"
                          onClick={() => handleSetToken(token)}
                        >
                          <img
                            className="w-8 h-8 rounded-full"
                            src={token.image || "/placeholder.svg"}
                            alt={token.symbol}
                          />
                          <div>
                            <div>{token.symbol}</div>
                            <div className="text-sm opacity-50">{token.name}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Priority Fee</p>
                    <div className="flex items-center justify-between">
                      <span>Enable Priority Fee</span>
                      <Switch
                        checked={isPriorityFeeEnabled}
                        onCheckedChange={(checked) => {
                          set({ isPriorityFeeEnabled: checked })
                          if (checked) {
                            toast.success("Priority fee enabled")
                          } else {
                            toast.error("Priority fee disabled")
                          }
                        }}
                      />
                    </div>
                    {isPriorityFeeEnabled && (
                      <div className="space-y-2">
                        <label className="text-sm">Priority Fee (Microlamports):</label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            value={newPriorityFee}
                            onChange={(e) => {
                              const parsedValue = Number.parseInt(e.target.value, 10)
                              if (!isNaN(parsedValue)) {
                                setNewPriorityFee(parsedValue)
                              }
                            }}
                          />
                          <Button onClick={handleSetPriorityFee}>Set</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <p className="text-sm font-medium">Referral Link</p>
                    <div className="flex space-x-2">
                      <Input value={`${window.location.origin}?code=${publicKey?.toString() || ""}`} readOnly />
                      <Button onClick={copyInvite} variant="outline">
                        <ClipboardCopy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <DialogClose asChild>
                      <Link href="/profile" passHref legacyBehavior>
                        <Button variant="outline" className="flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          View Profile
                        </Button>
                      </Link>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          disconnect()
                        }}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </DialogClose>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Button onClick={handleConnect} variant="outline">
              {connecting ? "Connecting" : "Connect Wallet"}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}

