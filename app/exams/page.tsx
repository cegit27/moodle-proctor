"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ExamsPage() {

  const router = useRouter();

  const [exams] = useState([
    {
      id: 1,
      name: "Data Structures Midterm",
      course: "CS201",
      date: "20 Mar 2026",
      time: "10:00 AM",
      duration: "2 Hours"
    },
    {
      id: 2,
      name: "Operating Systems Final",
      course: "CS301",
      date: "25 Mar 2026",
      time: "2:00 PM",
      duration: "3 Hours"
    },
    {
      id: 3,
      name: "Database Systems Quiz",
      course: "CS210",
      date: "28 Mar 2026",
      time: "11:00 AM",
      duration: "1 Hour"
    }
  ]);

  const startExam = (examId:number) => {
    router.push(`/dashboard?exam=${examId}`);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-10">

      <h1 className="text-3xl font-bold mb-8 text-center text-blue-600">
        Available Exams
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {exams.map((exam) => (

          <div
            key={exam.id}
            className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition"
          >

            <h2 className="text-xl font-semibold mb-2 text-blue-500">
              {exam.name}
            </h2>

            <p className="text-gray-600">
              Course: {exam.course}
            </p>

            <p className="text-gray-600">
              Date: {exam.date}
            </p>

            <p className="text-gray-600">
              Time: {exam.time}
            </p>

            <p className="text-gray-600 mb-4">
              Duration: {exam.duration}
            </p>

            <button
              onClick={() => startExam(exam.id)}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
            >
              Start Exam
            </button>

          </div>

        ))}

      </div>

    </div>
  );
}