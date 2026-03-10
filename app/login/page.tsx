"use client";

import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const handleLogin = () => {
    // Later integrate Moodle auth
    router.push("/exams");
  };

  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <button
        onClick={handleLogin}
        className="bg-blue-600 text-white px-6 py-3 rounded"
      >
        Login with Moodle
      </button>
    </div>
  );
}