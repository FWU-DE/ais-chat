import type { LlmModel } from '@ais-chat/api-database';

export type Usage = {
  input_text_tokens: number;
  output_text_tokens?: number;
  output_image_tokens: number;
};

export type ImageResponse = {
  // Base64-encoded images
  data: Array<string>;
  output_format?: 'png' | 'webp' | 'jpeg';
  usage?: Usage;
};

/** Reference image passed to an image editing endpoint */
export type ImageGenerationInputImage = {
  data: Buffer;
  mimeType: string;
  filename: string;
};

/** size must have the correct aspect ratio that is supported by the model */
export type ImageGenerationRequestOptions = {
  size: string; // e.g. "1024x1024", "1536x1024", "1408x768"
  inputImages?: ImageGenerationInputImage[];
};

export type ImageGenerationFn = (args: {
  prompt: string;
  model: string;
  options?: ImageGenerationRequestOptions;
}) => Promise<ImageResponse>;

// TODO: Just an alias for now, since the llmModel table needs renaming (it has image and embedding models too)
export type AiModel = LlmModel;
