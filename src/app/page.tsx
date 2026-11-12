"use client";
import { AuthGate } from "@/components/AuthGate";
import { LedgerApp } from "@/components/LedgerApp";
export default function HomePage() { return <AuthGate>{(user,settings)=><LedgerApp key={user.id} user={user} initialSettings={settings}/>}</AuthGate>; }
