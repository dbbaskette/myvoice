import ReactDiffViewer from "react-diff-viewer-continued";

interface DiffViewProps {
  oldValue: string;
  newValue: string;
}

export function DiffView({ oldValue, newValue }: DiffViewProps): JSX.Element {
  return (
    <div className="text-xs font-mono overflow-auto bg-white">
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={true}
        useDarkTheme={false}
        leftTitle="Input"
        rightTitle="Output"
        disableWordDiff={false}
        showDiffOnly={false}
      />
    </div>
  );
}
