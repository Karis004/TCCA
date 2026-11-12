"use client";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { AdminPanel } from "@/components/AdminPanel";
export default function AdminPage() { return <AuthGate>{user => user.role === "owner" ? <AdminPanel /> : <main className="app-shell"><section className="panel"><p>仅站长可进入用户管理。</p><Link href="/">返回账本</Link></section></main>}</AuthGate>; }
