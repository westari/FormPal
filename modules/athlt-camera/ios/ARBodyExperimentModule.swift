import ExpoModulesCore

public class ARBodyExperimentModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ARBodyExperiment")

        // View registers ARBodyExperimentView and its view-level event.
        // onDebugLog is dispatched via EventDispatcher on the view instance —
        // it arrives in JS as the onDebugLog callback prop, not a module emitter.
        View(ARBodyExperimentView.self) {
            Events("onDebugLog")
        }

        // mark() sets a flag read by the ARSessionDelegate on its next body-anchor
        // update, which then emits a [AR-MARK] snapshot via onDebugLog.
        Function("mark") {
            ARBodyExperimentView.activeInstance?.markSnapshot()
        }
    }
}
