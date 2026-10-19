import type { MetadataBuildSpecification } from "../../src/shared/metadataBuildTypes";
import { supportedImageDimensionExtensions } from "../imageDimensionTypes";
import { supportedVideoFactExtensions } from "../videoFactTypes";
import { CORE_IMAGE_METADATA_EXTRACTOR_VERSION, CORE_VIDEO_METADATA_EXTRACTOR_VERSION } from "./metadataExtractorVersions";
import { AUDIO_FACT_EXTRACTOR_VERSION, supportedAudioFactExtensions } from "../audioFactTypes";
import { FONT_FACT_EXTRACTOR_VERSION, supportedFontFactExtensions } from "../fontFactTypes";
import { MODEL_FACT_EXTRACTOR_VERSION, supportedModelFactExtensions } from "../modelFactTypes";
import { DOCUMENT_FACT_EXTRACTOR_VERSION, supportedDocumentFactExtensions } from "../documentFactTypes";
import { THREE_D_FACT_EXTRACTOR_VERSION, supportedThreeDFactExtensions } from "../threeDFactTypes";
import { ARCHIVE_FACT_EXTRACTOR_VERSION, supportedArchiveFactExtensions } from "../archiveFactTypes";
import { TEXT_DATA_FACT_EXTRACTOR_VERSION, supportedTextDataFactExtensions } from "../textDataFactTypes";

export type { MetadataBuildSpecification } from "../../src/shared/metadataBuildTypes";
// This same table is emitted into the independent Core resources; never duplicate versions/extensions in C#.
export const metadataBuildSpecifications: readonly MetadataBuildSpecification[] = [
  { kind: 0, extractorVersion: CORE_IMAGE_METADATA_EXTRACTOR_VERSION, extensions: supportedImageDimensionExtensions },
  { kind: 1, extractorVersion: CORE_VIDEO_METADATA_EXTRACTOR_VERSION, extensions: supportedVideoFactExtensions },
  { kind: 2, extractorVersion: AUDIO_FACT_EXTRACTOR_VERSION, extensions: supportedAudioFactExtensions },
  { kind: 3, extractorVersion: FONT_FACT_EXTRACTOR_VERSION, extensions: supportedFontFactExtensions },
  { kind: 4, extractorVersion: MODEL_FACT_EXTRACTOR_VERSION, extensions: supportedModelFactExtensions },
  { kind: 5, extractorVersion: DOCUMENT_FACT_EXTRACTOR_VERSION, extensions: supportedDocumentFactExtensions },
  { kind: 6, extractorVersion: THREE_D_FACT_EXTRACTOR_VERSION, extensions: supportedThreeDFactExtensions },
  { kind: 7, extractorVersion: TEXT_DATA_FACT_EXTRACTOR_VERSION, extensions: supportedTextDataFactExtensions },
  { kind: 8, extractorVersion: ARCHIVE_FACT_EXTRACTOR_VERSION, extensions: supportedArchiveFactExtensions }
];
