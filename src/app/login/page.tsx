"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import Link from "next/link";

export default function LoginPage() {
 const router = useRouter();
 const [email, setEmail] = useState("");
 const [password, setPassword] = useState("");
 const [error, setError] = useState("");
 const [loading, setLoading] = useState(false);

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 setLoading(true);
 setError("");

 const supabase = createClient();
 const { error } = await supabase.auth.signInWithPassword({ email, password });

 if (error) {
 setError(error.message);
 setLoading(false);
 return;
 }

 router.push("/dashboard");
 router.refresh();
 }

 return (
 <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center px-4 py-8">
 <div className="w-full max-w-sm">
 {/* Brand */}
 <div className="mb-8 text-center">
 <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">{APP_NAME}</h1>
 <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Sign in to your account</p>
 </div>

 {/* Card */}
 <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
 <form onSubmit={handleSubmit} className="space-y-4">
 <div className="space-y-1">
 <label htmlFor="email" className="block text-sm font-medium text-gray-700">
 Email
 </label>
 <input
 id="email"
 type="email"
 placeholder="you@company.com"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 required
 className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
 />
 </div>

 <div className="space-y-1">
 <div className="flex items-center justify-between">
   <label htmlFor="password" className="block text-sm font-medium text-gray-700">
     Password
   </label>
   <Link href="/forgot-password" className="text-xs text-blue-600 hover:text-blue-700 transition-colors">
     Forgot password?
   </Link>
 </div>
 <input
 id="password"
 type="password"
 placeholder="••••••••"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 required
 className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
 />
 </div>

 {error && (
 <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:text-red-400">
 {error}
 </div>
 )}

 <button
 type="submit"
 disabled={loading}
 className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
 >
 {loading ? "Signing in..." : "Sign In"}
 </button>
 </form>

 <div className="my-5 flex items-center gap-3">
 <div className="flex-1 h-px bg-gray-200" />
 <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
 <div className="flex-1 h-px bg-gray-200" />
 </div>

 <p className="text-center text-sm text-gray-500 dark:text-gray-400">
 No account?{" "}
 <Link href="/signup" className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
 Create one
 </Link>
 </p>
 </div>

 <div className="mt-6 flex flex-col items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
 <span>Secure · Encrypted · Enterprise-Grade</span>
 <Link href="/developer" className="hover:text-blue-600 dark:hover:text-blue-400 dark:text-blue-400 transition-colors underline underline-offset-2">
 Developer API Docs
 </Link>
 </div>
 </div>
 </div>
 );
}