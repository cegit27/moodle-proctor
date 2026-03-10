"use client";

import Navbar from "@/components/Navbar";
import VideoGrid from "@/components/VideoGrid";
import AlertPanel from "@/components/AlertPanel";
import { useSearchParams } from "next/navigation";

export default function Dashboard() {

  const searchParams = useSearchParams();

  // ensure examId is always a string
  const examId = searchParams.get("exam") ?? "";

  return (
    <div className="h-screen flex flex-col bg-gray-100">

      <Navbar examId={examId} />

      <div className="flex flex-1 overflow-hidden">

        <div className="flex-1 p-4 overflow-y-auto">
          <VideoGrid examId={examId} />
        </div>

        <div className="w-80 border-l bg-white">
          <AlertPanel examId={examId} />
        </div>

      </div>

    </div>
  );
} 