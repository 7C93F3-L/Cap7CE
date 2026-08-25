import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PreviewWindowData } from "../shared/types";
import { t } from "../../electron/localization";
import PreviewEmbeddedMetadata from "./preview/PreviewEmbeddedMetadata";
import WaitingIndicator from "./WaitingIndicator";

const initialMountedPageCount = 3;
const mountedPageBatchSize = 3;

const PdfPage = ({
  data,
  pageNumber,
  scrollRootRef,
  onError
}: {
  data: PreviewWindowData & { pdfPreview: NonNullable<PreviewWindowData["pdfPreview"]> };
  pageNumber: number;
  scrollRootRef: RefObject<HTMLDivElement>;
  onError: () => void;
}) => {
  const pageRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const page = pageRef.current;
    const root = scrollRootRef.current;
    if (!page || !root) return;
    const observer = new IntersectionObserver(([entry]) => {
      setNearViewport(Boolean(entry?.isIntersecting));
    }, {
      root,
      rootMargin: "100% 0px"
    });
    observer.observe(page);
    return () => observer.disconnect();
  }, [data.sessionId, pageNumber, scrollRootRef]);

  useEffect(() => {
    if (!nearViewport) setLoaded(false);
  }, [nearViewport]);

  const source = nearViewport
    ? `cap7ce://pdf-page/?path=${encodeURIComponent(data.filePath)}&session=${encodeURIComponent(data.sessionId)}&page=${pageNumber}`
    : "";
  const aspectRatio = `${data.pdfPreview.defaultPageWidth} / ${data.pdfPreview.defaultPageHeight}`;

  return (
    <article
      ref={pageRef}
      className="preview-pdf-page"
      data-pdf-page={pageNumber}
      aria-label={t("preview.pdfPageLabel", { page: pageNumber })}
      style={{ aspectRatio }}
    >
      {source && <img
        src={source}
        alt={t("preview.pdfPageLabel", { page: pageNumber })}
        draggable={false}
        className={loaded ? "is-loaded" : ""}
        onLoad={() => setLoaded(true)}
        onError={onError}
      />}
      {!loaded && nearViewport && (
        <span className="preview-pdf-page-loading" role="status">
          <WaitingIndicator className="preview-window-waiting-icon" />
        </span>
      )}
      <span className="preview-pdf-page-number">{pageNumber}</span>
    </article>
  );
};

const PdfPreviewPanel = ({
  data,
  scrollRef,
  onError
}: {
  data: PreviewWindowData & { pdfPreview: NonNullable<PreviewWindowData["pdfPreview"]> };
  scrollRef: RefObject<HTMLDivElement>;
  onError: () => void;
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [mountedPageCount, setMountedPageCount] = useState(() => (
    Math.min(initialMountedPageCount, data.pdfPreview.pageCount)
  ));
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    setCurrentPage(1);
    setMountedPageCount(Math.min(initialMountedPageCount, data.pdfPreview.pageCount));
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [data.pdfPreview.pageCount, data.sessionId, scrollRef]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!root || !sentinel || mountedPageCount >= data.pdfPreview.pageCount) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setMountedPageCount((current) => Math.min(
        data.pdfPreview.pageCount,
        current + mountedPageBatchSize
      ));
    }, { root, rootMargin: "100% 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [data.pdfPreview.pageCount, mountedPageCount, scrollRef]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
  }, []);

  const updateCurrentPage = () => {
    const container = scrollRef.current;
    if (!container || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const target = container.scrollTop + container.clientHeight * 0.4;
      let closestPage = 1;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const page of Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"))) {
        const pageNumber = Number(page.dataset.pdfPage);
        const distance = Math.abs(page.offsetTop - target);
        if (Number.isInteger(pageNumber) && distance < closestDistance) {
          closestPage = pageNumber;
          closestDistance = distance;
        }
      }
      setCurrentPage(closestPage);
      scrollFrameRef.current = null;
    });
  };

  const goToPage = (pageNumber: number) => {
    const targetPage = Math.min(data.pdfPreview.pageCount, Math.max(1, pageNumber));
    setMountedPageCount((current) => Math.max(current, Math.min(
      data.pdfPreview.pageCount,
      targetPage + 1
    )));
    setCurrentPage(targetPage);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        scrollRef.current
          ?.querySelector<HTMLElement>(`[data-pdf-page="${targetPage}"]`)
          ?.scrollIntoView({ block: "start", behavior: "auto" });
      });
    });
  };

  return (
    <section className="preview-pdf-panel">
      <header>
        <div className="preview-text-heading">
          <strong>{data.fileName}</strong>
          {data.embeddedMetadata && <PreviewEmbeddedMetadata key={data.sessionId} data={data.embeddedMetadata} variant="summary" />}
        </div>
        <nav aria-label={t("preview.pdfNavigation")}>
          <button
            type="button"
            disabled={currentPage <= 1}
            title={t("preview.pdfPreviousPage")}
            onClick={() => goToPage(currentPage - 1)}
          >‹</button>
          <span>{t("preview.pdfPageCount", { page: currentPage, total: data.pdfPreview.pageCount })}</span>
          <button
            type="button"
            disabled={currentPage >= data.pdfPreview.pageCount}
            title={t("preview.pdfNextPage")}
            onClick={() => goToPage(currentPage + 1)}
          >›</button>
        </nav>
      </header>
      <div
        ref={scrollRef}
        className="preview-pdf-scroll cap-main-scroll-viewport"
        onScroll={updateCurrentPage}
      >
        {Array.from({ length: mountedPageCount }, (_, index) => (
          <PdfPage
            key={`${data.sessionId}:${index + 1}`}
            data={data}
            pageNumber={index + 1}
            scrollRootRef={scrollRef}
            onError={onError}
          />
        ))}
        <div ref={bottomSentinelRef} className="preview-pdf-bottom-sentinel" aria-hidden="true" />
      </div>
    </section>
  );
};

export default PdfPreviewPanel;
