import { redirect } from "next/navigation";

// The root URL — hand off to the dashboard immediately.
// The (dashboard) route group adds its layout transparently.
export default function RootPage() {
  redirect("/chat");
}
