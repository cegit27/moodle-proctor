type NavbarProps = {
  examId: string;
};

export default function Navbar({ examId }: NavbarProps) {
  return (
    <div className="h-16 bg-blue-600 text-white flex items-center px-6 justify-between">
      <h1 className="text-lg font-semibold">Proctoring Dashboard</h1>

      <p className="text-sm">
        Exam ID: {examId}
      </p>
    </div>
  );
}