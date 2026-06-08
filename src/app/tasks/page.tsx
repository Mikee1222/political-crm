import { Suspense } from "react";
import { TasksContent } from "./tasks-content";

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksContent />
    </Suspense>
  );
}
