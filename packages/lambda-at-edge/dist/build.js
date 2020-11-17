"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_file_trace_1 = __importDefault(require("@zeit/node-file-trace"));
const execa_1 = __importDefault(require("execa"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = require("path");
const getAllFilesInDirectory_1 = __importDefault(require("./lib/getAllFilesInDirectory"));
const path_2 = __importDefault(require("path"));
const sortedRoutes_1 = require("./lib/sortedRoutes");
const isDynamicRoute_1 = __importDefault(require("./lib/isDynamicRoute"));
const pathToPosix_1 = __importDefault(require("./lib/pathToPosix"));
const expressifyDynamicRoute_1 = __importDefault(require("./lib/expressifyDynamicRoute"));
const pathToRegexStr_1 = __importDefault(require("./lib/pathToRegexStr"));
exports.DEFAULT_LAMBDA_CODE_DIR = "default-lambda";
exports.API_LAMBDA_CODE_DIR = "api-lambda";
const defaultBuildOptions = {
    args: [],
    cwd: process.cwd(),
    env: {},
    cmd: "./node_modules/.bin/next"
};
class Builder {
    constructor(nextConfigDir, outputDir, buildOptions) {
        this.buildOptions = defaultBuildOptions;
        this.nextConfigDir = path_2.default.resolve(nextConfigDir);
        this.dotNextDirectory = path_2.default.join(this.nextConfigDir, ".next");
        this.outputDir = outputDir;
        if (buildOptions) {
            this.buildOptions = buildOptions;
        }
    }
    readPublicFiles() {
        return __awaiter(this, void 0, void 0, function* () {
            const dirExists = yield fs_extra_1.default.pathExists(path_1.join(this.nextConfigDir, "public"));
            if (dirExists) {
                return getAllFilesInDirectory_1.default(path_1.join(this.nextConfigDir, "public"))
                    .map(e => e.replace(this.nextConfigDir, ""))
                    .map(e => e
                    .split(path_2.default.sep)
                    .slice(2)
                    .join("/"));
            }
            else {
                return [];
            }
        });
    }
    readPagesManifest() {
        return __awaiter(this, void 0, void 0, function* () {
            const path = path_1.join(this.nextConfigDir, ".next/serverless/pages-manifest.json");
            const hasServerlessPageManifest = yield fs_extra_1.default.pathExists(path);
            if (!hasServerlessPageManifest) {
                return Promise.reject("pages-manifest not found. Check if `next.config.js` target is set to 'serverless'");
            }
            const pagesManifest = yield fs_extra_1.default.readJSON(path);
            const pagesManifestWithoutDynamicRoutes = Object.keys(pagesManifest).reduce((acc, route) => {
                if (isDynamicRoute_1.default(route)) {
                    return acc;
                }
                acc[route] = pagesManifest[route];
                return acc;
            }, {});
            const dynamicRoutedPages = Object.keys(pagesManifest).filter(isDynamicRoute_1.default);
            const sortedDynamicRoutedPages = sortedRoutes_1.getSortedRoutes(dynamicRoutedPages);
            const sortedPagesManifest = pagesManifestWithoutDynamicRoutes;
            sortedDynamicRoutedPages.forEach(route => {
                sortedPagesManifest[route] = pagesManifest[route];
            });
            return sortedPagesManifest;
        });
    }
    get isServerlessTraceTarget() {
        try {
            const nextConfig = require(path_2.default.join(this.nextConfigDir, "next.config.js"));
            if (nextConfig.target === "experimental-serverless-trace") {
                return true;
            }
        }
        catch (err) {
        }
        return false;
    }
    copyLambdaHandlerDependencies(fileList, reasons, handlerDirectory) {
        return fileList
            .filter(file => {
            return !reasons[file] || reasons[file].type !== "initial";
        })
            .map((filePath) => {
            const resolvedFilePath = path_2.default.resolve(filePath);
            const dst = path_2.default.relative(this.nextConfigDir, resolvedFilePath);
            return fs_extra_1.default.copy(resolvedFilePath, path_1.join(this.outputDir, handlerDirectory, dst));
        });
    }
    buildDefaultLambda(buildManifest) {
        return __awaiter(this, void 0, void 0, function* () {
            let copyTraces = [];
            if (this.isServerlessTraceTarget) {
                const ignoreAppAndDocumentPages = (page) => {
                    const basename = path_2.default.basename(page);
                    return basename !== "_app.js" && basename !== "_document.js";
                };
                const allSsrPages = [
                    ...Object.values(buildManifest.pages.ssr.nonDynamic),
                    ...Object.values(buildManifest.pages.ssr.dynamic).map(entry => entry.file)
                ].filter(ignoreAppAndDocumentPages);
                const ssrPages = Object.values(allSsrPages).map(pageFile => path_2.default.join(this.dotNextDirectory, "serverless", pageFile));
                const { fileList, reasons } = yield node_file_trace_1.default(ssrPages, {
                    base: process.cwd()
                });
                copyTraces = this.copyLambdaHandlerDependencies(fileList, reasons, exports.DEFAULT_LAMBDA_CODE_DIR);
            }
            return Promise.all([
                ...copyTraces,
                fs_extra_1.default.copy(require.resolve("@sls-next/lambda-at-edge/dist/default-handler.js"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "index.js")),
                fs_extra_1.default.writeJson(path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "manifest.json"), buildManifest),
                fs_extra_1.default.copy(require.resolve("next-aws-cloudfront"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "node_modules/next-aws-cloudfront/index.js")),
                fs_extra_1.default.copy(path_1.join(this.nextConfigDir, ".next/serverless/pages"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "pages"), {
                    filter: (file) => {
                        const isNotPrerenderedHTMLPage = path_2.default.extname(file) !== ".html";
                        const isNotStaticPropsJSONFile = path_2.default.extname(file) !== ".json";
                        const isNotApiPage = pathToPosix_1.default(file).indexOf("pages/api") === -1;
                        return (isNotApiPage &&
                            isNotPrerenderedHTMLPage &&
                            isNotStaticPropsJSONFile);
                    }
                }),
                fs_extra_1.default.copy(path_1.join(this.nextConfigDir, ".next/prerender-manifest.json"), path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR, "prerender-manifest.json"))
            ]);
        });
    }
    buildApiLambda(apiBuildManifest) {
        return __awaiter(this, void 0, void 0, function* () {
            let copyTraces = [];
            if (this.isServerlessTraceTarget) {
                const allApiPages = [
                    ...Object.values(apiBuildManifest.apis.nonDynamic),
                    ...Object.values(apiBuildManifest.apis.dynamic).map(entry => entry.file)
                ];
                const apiPages = Object.values(allApiPages).map(pageFile => path_2.default.join(this.dotNextDirectory, "serverless", pageFile));
                const { fileList, reasons } = yield node_file_trace_1.default(apiPages, {
                    base: process.cwd()
                });
                copyTraces = this.copyLambdaHandlerDependencies(fileList, reasons, exports.API_LAMBDA_CODE_DIR);
            }
            return Promise.all([
                ...copyTraces,
                fs_extra_1.default.copy(require.resolve("@sls-next/lambda-at-edge/dist/api-handler.js"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "index.js")),
                fs_extra_1.default.copy(require.resolve("next-aws-cloudfront"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "node_modules/next-aws-cloudfront/index.js")),
                fs_extra_1.default.copy(path_1.join(this.nextConfigDir, ".next/serverless/pages/api"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "pages/api")),
                fs_extra_1.default.copy(path_1.join(this.nextConfigDir, ".next/serverless/pages/_error.js"), path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "pages/_error.js")),
                fs_extra_1.default.writeJson(path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR, "manifest.json"), apiBuildManifest)
            ]);
        });
    }
    prepareBuildManifests() {
        return __awaiter(this, void 0, void 0, function* () {
            const pagesManifest = yield this.readPagesManifest();
            const defaultBuildManifest = {
                pages: {
                    ssr: {
                        dynamic: {},
                        nonDynamic: {}
                    },
                    html: {
                        dynamic: {},
                        nonDynamic: {}
                    }
                },
                publicFiles: {}
            };
            const apiBuildManifest = {
                apis: {
                    dynamic: {},
                    nonDynamic: {}
                }
            };
            const ssrPages = defaultBuildManifest.pages.ssr;
            const htmlPages = defaultBuildManifest.pages.html;
            const apiPages = apiBuildManifest.apis;
            const isHtmlPage = (path) => path.endsWith(".html");
            const isApiPage = (path) => path.startsWith("pages/api");
            Object.entries(pagesManifest).forEach(([route, pageFile]) => {
                const dynamicRoute = isDynamicRoute_1.default(route);
                const expressRoute = dynamicRoute ? expressifyDynamicRoute_1.default(route) : null;
                if (isHtmlPage(pageFile)) {
                    if (dynamicRoute) {
                        const route = expressRoute;
                        htmlPages.dynamic[route] = {
                            file: pageFile,
                            regex: pathToRegexStr_1.default(route)
                        };
                    }
                    else {
                        htmlPages.nonDynamic[route] = pageFile;
                    }
                }
                else if (isApiPage(pageFile)) {
                    if (dynamicRoute) {
                        const route = expressRoute;
                        apiPages.dynamic[route] = {
                            file: pageFile,
                            regex: pathToRegexStr_1.default(route)
                        };
                    }
                    else {
                        apiPages.nonDynamic[route] = pageFile;
                    }
                }
                else if (dynamicRoute) {
                    const route = expressRoute;
                    ssrPages.dynamic[route] = {
                        file: pageFile,
                        regex: pathToRegexStr_1.default(route)
                    };
                }
                else {
                    ssrPages.nonDynamic[route] = pageFile;
                }
            });
            const publicFiles = yield this.readPublicFiles();
            publicFiles.forEach(pf => {
                defaultBuildManifest.publicFiles["/" + pf] = pf;
            });
            return {
                defaultBuildManifest,
                apiBuildManifest
            };
        });
    }
    cleanupDotNext() {
        return __awaiter(this, void 0, void 0, function* () {
            const dotNextDirectory = path_1.join(this.nextConfigDir, ".next");
            const exists = yield fs_extra_1.default.pathExists(dotNextDirectory);
            if (exists) {
                const fileItems = yield fs_extra_1.default.readdir(dotNextDirectory);
                yield Promise.all(fileItems
                    .filter(fileItem => fileItem !== "cache")
                    .map(fileItem => fs_extra_1.default.remove(path_1.join(dotNextDirectory, fileItem))));
            }
        });
    }
    build() {
        return __awaiter(this, void 0, void 0, function* () {
            const { cmd, args, cwd, env } = Object.assign(defaultBuildOptions, this.buildOptions);
            yield this.cleanupDotNext();
            yield fs_extra_1.default.emptyDir(path_1.join(this.outputDir, exports.DEFAULT_LAMBDA_CODE_DIR));
            yield fs_extra_1.default.emptyDir(path_1.join(this.outputDir, exports.API_LAMBDA_CODE_DIR));
            yield execa_1.default(cmd, args, {
                cwd,
                env
            });
            const { defaultBuildManifest, apiBuildManifest } = yield this.prepareBuildManifests();
            yield this.buildDefaultLambda(defaultBuildManifest);
            const hasAPIPages = Object.keys(apiBuildManifest.apis.nonDynamic).length > 0 ||
                Object.keys(apiBuildManifest.apis.dynamic).length > 0;
            if (hasAPIPages) {
                yield this.buildApiLambda(apiBuildManifest);
            }
        });
    }
}
exports.default = Builder;
