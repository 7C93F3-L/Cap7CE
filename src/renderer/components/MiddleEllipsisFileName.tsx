import { splitMiddleEllipsisFileName } from "../ImageContextMenu";

export const MiddleEllipsisFileName = ({ fileName, className }: { fileName: string; className: string }) => {
  const splitFileName = splitMiddleEllipsisFileName(fileName);
  return (
    <span className={className} title={fileName}>
      <span className="cap-middle-ellipsis-leading">{splitFileName.leading}</span>
      {splitFileName.trailing && <span className="cap-middle-ellipsis-trailing">{splitFileName.trailing}</span>}
    </span>
  );
};

export const TwoLineMiddleEllipsisFileName = ({ fileName, className }: { fileName: string; className: string }) => {
  const splitFileName = splitMiddleEllipsisFileName(fileName);
  return (
    <span className={`${className} cap-two-line-middle-name${splitFileName.trailing ? " is-split" : ""}`} title={fileName}>
      <span className="cap-two-line-middle-leading">{splitFileName.leading}</span>
      {splitFileName.trailing && <span className="cap-two-line-middle-trailing">{`\u2026${splitFileName.trailing}`}</span>}
    </span>
  );
};
