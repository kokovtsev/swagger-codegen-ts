import { Decoder, literal, type, union } from 'io-ts';
import { FSEntity, write } from './utils/fs';
import * as path from 'path';
import * as $RefParser from 'json-schema-ref-parser';
import { pipe } from 'fp-ts/lib/pipeable';
import { array, either, taskEither } from 'fp-ts';
import { Either, isLeft, toError } from 'fp-ts/lib/Either';
import { identity } from 'fp-ts/lib/function';
import { reportIfFailed } from './utils/io-ts';
import { TaskEither } from 'fp-ts/lib/TaskEither';
import { sketchParser121 } from './parsers/sketch-121';
import { ResolveRef, ResolveRefContext } from './utils/ref';
import { Reader } from 'fp-ts/lib/Reader';

export interface Language<A> {
	(documents: Record<string, A>): Either<unknown, FSEntity>;
}

export interface GenerateOptions<A> {
	/**
	 * Base directory for the generation task.
	 * Relative paths provided in the `out` and `spec` options are resolved relative to this path.
	 * @default current working directory
	 */
	readonly cwd?: string;
	/**
	 * Path to the output files.
	 * Relative paths are resolved relative to `cwd`.
	 */
	readonly out: string;
	/**
	 * Path to the source schema.
	 * Supports local files and remote URLs, YAML and JSON formats.
	 * Relative paths are resolved relative to `cwd`
	 */
	readonly spec: string;
	/**
	 * The `decoder` is used to parse the specification file. In most cases, one of the following decoders should be
	 * chosen depending on the source format:
	 * - `SwaggerObject`
	 * - `OpenapiObjectCodec`
	 * - `AsyncAPIObjectCodec`
	 */
	readonly decoder: Decoder<unknown, A>;
	/**
	 * The `language` implements the generation of the code from the intermediate format `A` into actual
	 * file system objects. Most users should import one of the predefined languages:
	 * - `import { serialize as serializeSwagger2 } from '@devexperts/swagger-codegen-ts/dist/language/typescript/2.0'`
	 * - `import { serialize as serializeOpenAPI3 } from '@devexperts/swagger-codegen-ts/dist/language/typescript/3.0'`
	 * - `import { serialize as serializeAsyncAPI } from '@devexperts/swagger-codegen-ts/dist/language/typescript/asyncapi-2.0.0'`
	 */
	readonly language: Reader<ResolveRefContext, Language<A>>;
}

const log = (...args: unknown[]) => console.log('[SWAGGER-CODEGEN-TS]:', ...args);
const getUnsafe: <E, A>(e: Either<E, A>) => A = either.fold(e => {
	throw e;
}, identity);

export const generate = <A>(options: GenerateOptions<A>): TaskEither<unknown, void> =>
	taskEither.tryCatch(async () => {
		const cwd = options.cwd || process.cwd();
		const out = path.isAbsolute(options.out) ? options.out : path.resolve(cwd, options.out);
		const spec = path.isAbsolute(options.spec) ? options.spec : path.resolve(cwd, options.spec);
		log('Processing', spec);

		const $refs = await $RefParser.resolve(spec, {
			dereference: {
				circular: 'ignore',
			},
			parse: {
				sketch: sketchParser121,
			},
		});

		const specs: Record<string, A> = pipe(
			Object.entries($refs.values()),
			array.reduce({}, (acc, [fullPath, schema]) => {
				const isRoot = fullPath === spec;
				const relative = path.relative(cwd, fullPath);
				// skip specLike check for root because it should always be decoded with passed decoder and fail
				if (!isRoot && isLeft(specLikeCodec.decode(schema))) {
					log('Unable to decode', relative, 'as spec. Treat it as an arbitrary json.');
					// this is not a spec - treat as arbitrary json
					return acc;
				}
				// use getUnsafe to fail fast if unable to decode a spec
				const decoded = getUnsafe(reportIfFailed(options.decoder.decode(schema)));
				log('Decoded', relative);
				return {
					...acc,
					[relative]: decoded,
				};
			}),
		);

		log('Writing to', out);

		const resolveRef: ResolveRef = ($ref, decoder) =>
			pipe(
				either.tryCatch(() => $refs.get($ref), toError),
				either.chain(resolved => reportIfFailed(decoder.decode(resolved))),
			);

		await write(out, getUnsafe(options.language({ resolveRef })(specs)));

		log('Done');
	}, identity);

const specLikeCodec = union([
	type({
		swagger: literal('2.0'),
	}),
	type({
		openapi: union([literal('3.0.0'), literal('3.0.1'), literal('3.0.2')]),
	}),
	type({
		asyncapi: literal('2.0.0'),
	}),
	type({
		// sketch-like structure
		meta: type({
			version: literal(121),
		}),
	}),
]);
