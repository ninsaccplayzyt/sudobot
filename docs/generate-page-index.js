const { lstatSync, read, readdirSync, existsSync } = require("fs");
const { readFile, writeFile, cp } = require("fs/promises");
const { glob } = require("glob");
const path = require("path");

(async () => {
    const pages = await glob("app/**/page.{tsx,mdx,md}");
    const index = [];

    async function loadDocsIndex(
        directory = path.resolve(__dirname, "app/(docs)"),
        href = "/",
    ) {
        const data = [];
        const files = readdirSync(directory);

        for (const filename of files) {
            console.log("INDEXING", filename, directory);
            const file = path.resolve(directory, filename);
            const stat = lstatSync(file);

            if (stat.isDirectory()) {
                const info = await loadDocsIndex(
                    file,
                    `${href}${href === "/" ? "" : "/"}${filename}`,
                );
                const i = info.children.findIndex(
                    c =>
                        c.name === "page.mdx" ||
                        c.name === "page.md" ||
                        c.name === "page.tsx",
                );
                const removed = i !== -1 ? info.children.splice(i, 1)[0] : null;

                data.push(
                    i !== -1
                        ? {
                              ...info,
                              children: info.children,
                              type: "page",
                              data: info.data ?? removed.data,
                          }
                        : info,
                );

                continue;
            }

            if (
                filename !== "page.tsx" &&
                filename !== "page.md" &&
                filename !== "page.mdx"
            )
                continue;

            const isMDX = file.endsWith(".mdx") || file.endsWith(".md");
            const info = isMDX
                ? await generateIndexForMDXPage(file)
                : await generateIndexForTSXPage(file);

            data.push({
                type: "page",
                name: path.basename(filename),
                url: file
                    .replace(/[\/\\]\([a-z0-9A-Z_-]+\)/gi, "")
                    .replace(/^app[\/\\]/gi, "")
                    .replace(/page\.(tsx|md|mdx)$/gi, "")
                    .replace(/\\/g, "/"),
                path: file.replace(/\\/g, "/"),
                data: {
                    title: info.title,
                    short_name: info.short_name,
                },
            });

            console.log("NESTED INDEXED", file);
        }

        const name = path.basename(directory);

        const dirdata = existsSync(path.join(directory, "metadata.json"))
            ? JSON.parse(
                  await readFile(
                      path.join(directory, "metadata.json"),
                      "utf-8",
                  ),
              )
            : null;
        const children = [...(dirdata?.entries ?? []), ...data];

        children.sort((a, b) => {
            if (dirdata?.sort_as) {
                const aIndex = dirdata.sort_as.indexOf(a.name);
                const bIndex = dirdata.sort_as.indexOf(b.name);

                if (aIndex !== -1 && bIndex !== -1) {
                    return aIndex - bIndex;
                } else if (aIndex !== -1) {
                    return -1;
                } else if (bIndex !== -1) {
                    return 1;
                }
            }

            return a.name.localeCompare(b.name);
        });

        return {
            type: "directory",
            name: name === "(docs)" ? "/" : name,
            children: children,
            href,
            data: dirdata
                ? {
                      title: dirdata.title,
                      short_name: dirdata.short_name,
                  }
                : undefined,
        };
    }

    for (const page of pages) {
        const isMDX = page.endsWith(".mdx") || page.endsWith(".md");

        index.push(
            isMDX
                ? await generateIndexForMDXPage(page)
                : await generateIndexForTSXPage(page),
        );

        console.log("DONE ", page);
    }

    await writeFile(path.join(__dirname, "index.json"), JSON.stringify(index));

    await writeFile(
        path.join(__dirname, "docs_index.json"),
        JSON.stringify(await loadDocsIndex(), null, 4),
    );

    try {
        await cp(
            path.join(__dirname, "index.json"),
            path.join(__dirname, ".next/server/index.json"),
        );
    } catch (error) {
        console.error(error);
    }
})();

async function generateIndexForMDXPage(page) {
    const contents = await readFile(page, {
        encoding: "utf-8",
    });
    let [frontmatter, data] = contents
        .substring(contents.startsWith("---") ? 3 : 0)
        .split("\n---\n");

    if (!contents.trimStart().startsWith("---")) {
        data = frontmatter;
        frontmatter = null;
    }

    const entries = frontmatter
        ?.split("\n")
        .filter(Boolean)
        .map(entry =>
            entry
                .split(/:(.*)/s)
                .filter(Boolean)
                .map((a, i) => {
                    const trimmed = a.trim();
                    return i === 1 &&
                        trimmed.startsWith('"') &&
                        trimmed.endsWith('"')
                        ? trimmed.substring(1, trimmed.length - 1).trim()
                        : trimmed;
                }),
        );

    const frontmatterData = entries ? Object.fromEntries(entries) : null;

    return {
        ...frontmatterData,
        data: (data ?? "")
            .replace(/^(([\s\r\n]*)import([^.]+);)+/gi, "")
            .replace(/^(([\s\r\n]*)export([^.]+);)+/gi, "")
            .replace(/([\s\r\n]*)export default ([^;]+);$/gi, "")
            .replace(/<\/?[^>]+(>|$)/g, ""),
        url:
            "/" +
            page
                .replace(/[\/\\]\([a-z0-9A-Z_-]+\)/gi, "")
                .replace(/^app[\/\\]/gi, "")
                .replace(/page\.(tsx|md|mdx)$/gi, "")
                .replace(/\\/g, "/"),
        path: page.replace(/\\/g, "/"),
    };
}

async function generateIndexForTSXPage(page) {
    throw new Error("Not implemented");
}
