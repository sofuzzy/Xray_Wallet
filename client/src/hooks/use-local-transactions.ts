import { useState, useEffect, useCallback } from "react";

export interface LocalTransaction {
  id: string;
  fromAddr: string;
  toAddr: string;
  amount: string;
  signature: string;
  status: string;
  type: "transfer" | "swap";
  inputToken?: string;
  outputToken?: string;
  outputAmount?: string;
  timestamp: string;
}

const STORAGE_KEY = "xray_local_transactions";
const MAX_TRANSACTIONS = 50;

function getStoredTransactions(): LocalTransaction[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveTransactions(transactions: LocalTransaction[]) {
  try {
    const limited = transactions.slice(0, MAX_TRANSACTIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error("[local-tx] Failed to save transactions:", error);
  }
}

export function useLocalTransactions(walletAddress?: string) {
  const [transactions, setTransactions] = useState<LocalTransaction[]>([]);

  useEffect(() => {
    const all = getStoredTransactions();
    if (walletAddress) {
      const filtered = all.filter(
        tx => tx.fromAddr === walletAddress || tx.toAddr === walletAddress
      );
      setTransactions(filtered);
    } else {
      setTransactions(all);
    }
  }, [walletAddress]);

  const addTransaction = useCallback((tx: Omit<LocalTransaction, "id" | "timestamp">) => {
    const newTx: LocalTransaction = {
      ...tx,
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
    
    const all = getStoredTransactions();
    const updated = [newTx, ...all];
    saveTransactions(updated);
    
    setTransactions(prev => [newTx, ...prev]);
    
    return newTx;
  }, []);

  const clearTransactions = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setTransactions([]);
  }, []);

  return {
    transactions,
    addTransaction,
    clearTransactions,
  };
}

export function addLocalTransaction(tx: Omit<LocalTransaction, "id" | "timestamp">) {
  const newTx: LocalTransaction = {
    ...tx,
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
  
  const all = getStoredTransactions();
  const updated = [newTx, ...all];
  saveTransactions(updated);
  
  window.dispatchEvent(new CustomEvent("local-transaction-added", { detail: newTx }));
  
  return newTx;
}
