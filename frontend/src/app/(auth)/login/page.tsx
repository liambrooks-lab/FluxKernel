"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Github, Mail, Lock, Zap } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Auth logic placeholder
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[hsl(240,5%,8%)]">
      {/* Ambient glow blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-[400px] w-[600px] rounded-full bg-violet-600/20 blur-[120px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/4 top-1/4"
      >
        <div className="h-[300px] w-[300px] rounded-full bg-indigo-500/10 blur-[100px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1/4 right-1/4"
      >
        <div className="h-[250px] w-[250px] rounded-full bg-fuchsia-600/10 blur-[90px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo / Brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20 border border-violet-500/30 shadow-lg shadow-violet-900/30">
            <Zap className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">FluxKernel</h1>
          <p className="text-sm text-zinc-400">Sign in to your workspace</p>
        </div>

        {/* Card body */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">
          {/* GitHub SSO */}
          <button
            type="button"
            className="mb-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-all hover:bg-white/10 hover:border-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500"
          >
            <Github className="h-4 w-4" />
            Sign in with GitHub
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-transparent px-3 text-zinc-500 tracking-wider">
                or continue with email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium text-zinc-400">
                Email address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-medium text-zinc-400">
                  Password
                </label>
                <Link
                  href="#"
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all hover:bg-violet-500 hover:shadow-violet-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[0.98]"
            >
              Sign In
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}