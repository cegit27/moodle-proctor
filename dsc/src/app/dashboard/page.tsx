import { AlertPanel } from "@components/AlertPanel";
import { DashboardStats } from "@components/DashboardStats";
import { ReportTable } from "@components/ReportTable";
import { StudentsGrid } from "@components/StudentsGrid";

export default function DashboardOverviewPage() {
  return (
    <>
      <DashboardStats />
      <StudentsGrid />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AlertPanel />
        <ReportTable />
      </div>
    </>
  );
}

