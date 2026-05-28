// narrate-rewrite — rewrite a status line in a chosen personality/tone using
// Apple's on-device Foundation Model (Apple Intelligence). macOS 26+.
//
//   echo "<text>" | narrate-rewrite "<personality>"
//
// Prints one short spoken sentence in that tone. On any failure it prints
// nothing and exits non-zero, so the caller can fall back to the verbatim text.
//
// Compiled on demand by the /narrate skill:
//   swiftc -O -parse-as-library narrate-rewrite.swift -o ~/.claude/narrate-rewrite

import Foundation
import FoundationModels

@main
struct NarrateRewrite {
    static func main() async {
        let personality = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "casual"
        let input = (String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { exit(0) }

        guard #available(macOS 26.0, *) else {
            FileHandle.standardError.write(Data("narrate-rewrite: macOS too old\n".utf8)); exit(1)
        }
        guard case .available = SystemLanguageModel.default.availability else {
            FileHandle.standardError.write(Data("narrate-rewrite: model unavailable\n".utf8)); exit(1)
        }

        let instructions = """
        You turn a coding assistant's status update into ONE short spoken sentence \
        for text-to-speech narration. Speak in this personality/tone: \(personality).
        Rules: exactly one sentence, 30 words max, plain spoken English, \
        no markdown, no emoji, no quotation marks, no preamble. Output only the sentence.
        """

        do {
            let session = LanguageModelSession(instructions: instructions)
            let response = try await session.respond(to: input)
            print(response.content.trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
            FileHandle.standardError.write(Data("narrate-rewrite: \(error)\n".utf8)); exit(1)
        }
    }
}
