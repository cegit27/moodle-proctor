type Props = {
  name: string;
};

export default function StudentCard({ name }: Props) {
  return (
    <div className="bg-black text-white rounded p-2">
      <div className="h-32 bg-gray-800 flex items-center justify-center">
        Webcam
      </div>

      <div className="flex justify-between mt-2">
        <span>{name}</span>

        <button className="bg-red-500 px-2 py-1 text-xs rounded">
          Flag
        </button>
      </div>
    </div>
  );
}