type AlertPanelProps = {
  examId: string;
};

export default function AlertPanel({ examId }: AlertPanelProps) {
  return (
    <div className="p-4">
      <h2 className="font-semibold mb-4 text-blue-500">
        Alerts for Exam {examId}
      </h2>

      <ul className="space-y-2 text-sm">
        <li className="text-red-500">Student looking away</li>
        <li className="text-yellow-500">Multiple faces detected</li>
      </ul>
    </div>
  );
}