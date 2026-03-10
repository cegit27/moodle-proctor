type VideoGridProps = {
  examId: string;
};

export default function VideoGrid({ examId }: VideoGridProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4 text-blue-500">
        Monitoring Students for Exam {examId}
      </h2>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-black h-40 rounded"></div>
        <div className="bg-black h-40 rounded"></div>
        <div className="bg-black h-40 rounded"></div>
      </div>
    </div>
  );
}