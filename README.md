[![Build Status](https://travis-ci.org/devexperts/swagger-codegen-ts.svg?branch=master)](https://travis-ci.org/devexperts/swagger-codegen-ts)

# OpenAPI code generator for TypeScript

## Features
* Generates client code from **OpenAPI 3.0, 2.0** (aka Swagger) and **AsyncAPI**
* **Pluggable HTTP clients:** can use `fetch`, `Axios` or any other library
* **Flexible response types:** works with promises and reactive streams like RxJS
* **Runtime type checks:** validates server responses against the spec
* Written in **pure TypeScript** using [`fp-ts`](https://github.com/gcanti/fp-ts) and [`io-ts`](https://github.com/gcanti/io-ts) libraries

## Using the generated code

The examples below use the code generated from the [Pet Store OpenAPI 3.0 schema](https://petstore3.swagger.io/).

As demonstrated above, the controllers created with different clients will return different result types:

```typescript
import { petController } from "./src/generated/petstore.json/paths/PetController";
import { Pet } from "./src/generated/petstore.json/components/schemas/Pet";
import { Observable } from "rxjs";

// Creating a controller, see the "HTTP Clients" wiki page for more details
const petFetchController = petController(fetchHttpClient);

// The returned object is guaranteed to be a valid `Pet`
const createdPet: Promise<Pet> = petFetchController.addPet({
  body: {
    // The parameters are statically typed, IntelliSense works, too
    name: "Spotty",
    photoUrls: [],
  },
});

// Create another controller returning an RxJS stream
const petRxjsController = petController(rxjsHttpClient);
const createdPet$: Observable<Pet> = petRxjsController.addPet({
  body: {
    name: "Spotty",
    photoUrls: [],
  },
});
```

The codegen provides first class support for the [`RemoteData`](https://github.com/devexperts/remote-data-ts) type, making it possible to build complex logic on top of the generated controllers.

```typescript
const petRDController = petController(remoteDataHttpClient);
/**
 * Emits `pending` when the request is started,
 * then `success(Pet)` or `failure(Error)` upon completion.
 */
const createdPet$: Observable<RemoteData<Error, Pet>> = petRDController.addPet({
  body: {
    name: "Spotty",
    photoUrls: [],
  },
});
```

Each schema in the spec is translated into a type and an `io-ts` codec, which can be used for runtime type checking in the application code:

```typescript
import { either } from "fp-ts";
import { pipe } from "fp-ts/function";
import { User, UserIO } from "./src/generated/petstore.json/components/schemas/User";

pipe(
    UserIO.decode(JSON.parse(localStorage.getItem('PetStore.user'))),
    either.fold(
        error => {
            console.log('The user record is not valid');
        },
        (user: User) => {
            console.log(`Was previously logged in as: ${user.email}`);
        }
    )
);
```

Learn more on the `Either` type: [Getting started with fp-ts: Either vs Validation](https://dev.to/gcanti/getting-started-with-fp-ts-either-vs-validation-5eja)

## Installation guide

1. Make sure the peer dependencies are installed, then install the codegen itself:
```
yarn add fp-ts io-ts io-ts-types
yarn add -D @devexperts/swagger-codegen-ts
```

2. Create a console script that would invoke the `generate` function, passing the options such as path to the schema file and the output directory. See `examples/generate` for sample scripts.

3. In most cases, you might want to include the code generation step into the build and local launch scripts. Example:
```diff
/* package.json */

  "scripts": {
+   "generate:api": "ts-node scripts/generate-api.ts",
-   "start": "react-scripts start",
+   "start": "yarn generate:api && react-scripts start",
-   "build": "react-scripts build"
+   "build": "yarn generate:api && react-scripts build"
  }
```

## Contributing

* Feel free to file bugs and feature requests in [GitHub issues](https://github.com/devexperts/swagger-codegen-ts/issues/new).
* Pull requests are welcome - please use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.2/).

### FAQ
  1. **Why don't spec codecs reuse common parts?**
   
     That's because different versions of specs refer to different versions of [JSON Schema](http://json-schema.org) and they are generally not the same. We would like to avoid maintaining JSON Schema composition in this project. (for now)  

### Publish
`npm version major|minor|patch`
