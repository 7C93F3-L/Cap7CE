import type { MetadataBuildSpecification } from "../../../core/shared/metadataBuildTypes";
import { supportedImageDimensionExtensions } from "../fileFacts/domain/imageDimensionTypes";
import { supportedVideoFactExtensions } from "../fileFacts/domain/videoFactTypes";
import { CORE_IMAGE_METADATA_EXTRACTOR_VERSION, CORE_VIDEO_METADATA_EXTRACTOR_VERSION } from "../fileFacts/domain/metadataExtractorVersions";
import { AUDIO_FACT_EXTRACTOR_VERSION, supportedAudioFactExtensions } from "../fileFacts/domain/audioFactTypes";
import { FONT_FACT_EXTRACTOR_VERSION, supportedFontFactExtensions } from "../fileFacts/domain/fontFactTypes";
import { MODEL_FACT_EXTRACTOR_VERSION, supportedModelFactExtensions } from "../fileFacts/domain/modelFactTypes";
import { DOCUMENT_FACT_EXTRACTOR_VERSION, supportedDocumentFactExtensions } from "../fileFacts/domain/documentFactTypes";
import { THREE_D_FACT_EXTRACTOR_VERSION, supportedThreeDFactExtensions } from "../resourceCatalog/domain/formats/threeDFactTypes";
import { ARCHIVE_FACT_EXTRACTOR_VERSION, supportedArchiveFactExtensions } from "../fileFacts/domain/archiveFactTypes";
import { TEXT_DATA_FACT_EXTRACTOR_VERSION, supportedTextDataFactExtensions } from "../fileFacts/domain/textDataFactTypes";

export type { MetadataBuildSpecification } from "../../../core/shared/metadataBuildTypes";
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
