import { OriginRequestEvent } from "./types";
import { CloudFrontResultResponse, CloudFrontRequest } from "aws-lambda";
export declare const handler: (event: OriginRequestEvent) => Promise<CloudFrontRequest | CloudFrontResultResponse>;
