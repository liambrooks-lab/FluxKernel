"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Github, Mail, Lock, User, Zap } from "lucide-react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    // Auth logic placeholder
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[hsl(240,5%,8%)]">
      {/* Ambient glow blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-[400px] w-[600px] rounded-full bg-indigo-600/20 blur-[120px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 top-1/4"
      >
        <div className="h-[280px] w-[280px] rounded-full bg-violet-500/10 blur-[90px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1/4 left-1/4"
      >
        <div className="h-[280px] w-[280px] rounded-full bg-cyan-600/10 blur-[100px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-6">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30 shadow-lg shadow-indigo-900/30">
            <Zap className="h-6 w-6 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">FluxKernel</h1>
          <p className="text-sm text-zinc-400">Create your workspace account</p>
        </div>

        {/* Card body */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">
          {/* GitHub SSO */}
          <button
            type="button"
            className="mb-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-all hover:bg-white/10 hover:border-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
          >
            <Github className="h-4 w-4" />
            Sign up with GitHub
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-transparent px-3 text-zinc-500 tracking-wider">
                or register with email
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Full Name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-xs font-medium text-zinc-400">
                Full Name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                />
              </div>
            </div>

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
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-medium text-zinc-400">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-xs font-medium text-zinc-400">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setMismatch(false);
                  }}
                  placeholder="Repeat your password"
                  required
                  className={`w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 transition-all bg-white/[0.04] focus:bg-white/[0.06] ${
                    mismatch
                      ? "border-red-500/60 focus:ring-red-500/50 focus:border-red-500/60"
                      : "border-white/[0.08] focus:border-indigo-500/50 focus:ring-indigo-500/50"
                  }`}
                />
              </div>
              {mismatch && (
                <p className="text-xs text-red-400 mt-0.5">Passwords do not match.</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition-all hover:bg-indigo-500 hover:shadow-indigo-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[0.98]"
            >
              Create Account
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}