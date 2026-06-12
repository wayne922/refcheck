import React, { useState, useEffect } from "react";
import { 
  Settings, 
  Plus, 
  Trash2, 
  Eye, 
  Save, 
  Settings2,
  ChevronDown,
  Sparkles,
  ArrowRight,
  GitBranch,
  Play,
  X,
  PlusCircle,
  Copy,
  FolderPlus,
  Compass
} from "lucide-react";
import { AuthState } from "../App.tsx";

interface Question {
  id: string;
  type: "short_text" | "long_text" | "rating" | "yes_no" | "multiple_choice" | "single_select" | "dropdown" | "section_heading";
  label: string;
  description: string;
  required: boolean;
  options?: string[];
  risk_rule?: { condition: string; value: string; severity: "high" | "medium" };
  branch_rules?: { condition: string; value: string; action: "show" | "hide"; targetId: string }[];
}

interface Template {
  id: string;
  Name: string;
  Description?: string;
  Industry: string;
  Is_System_Template: boolean;
  Status: string;
  Questions_JSON: string;
  Branching_Rules_JSON?: string;
}

interface FormBuilderProps {
  auth: AuthState;
}

export function FormBuilder({ auth }: FormBuilderProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "flow">("edit");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  
  // Modals state
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  
  // AI Generator Form
  const [jobDescription, setJobDescription] = useState("");
  const [aiIndustry, setAiIndustry] = useState("General");
  const [aiGenerating, setAiGenerating] = useState(false);

  // New Template Form
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateIndustry, setNewTemplateIndustry] = useState("General");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Preview form answers simulation
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});

  const fetchTemplates = async (selectId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/questionnaire-templates", {
        headers: { "Authorization": `Bearer ${auth.token}` }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load templates");
      }
      setTemplates(data.templates);
      
      // Auto-select first template if none selected, or match requested ID
      if (data.templates.length > 0) {
        const targetId = selectId || data.templates[0].id;
        setActiveTemplateId(targetId);
        const activeTemp = data.templates.find((t: Template) => t.id === targetId);
        if (activeTemp) {
          setQuestions(JSON.parse(activeTemp.Questions_JSON || "[]"));
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [auth]);

  const handleSelectTemplate = (id: string) => {
    setActiveTemplateId(id);
    const selected = templates.find(t => t.id === id);
    if (selected) {
      setQuestions(JSON.parse(selected.Questions_JSON || "[]"));
    }
    setSelectedQuestionId(null);
    setPreviewAnswers({});
  };

  const handleAddQuestion = (type: Question["type"]) => {
    const newQuestion: Question = {
      id: `q_${Date.now()}`,
      type,
      label: `New ${type.replace("_", " ")} Question`,
      description: "",
      required: false,
      options: type === "dropdown" || type === "single_select" || type === "multiple_choice" ? ["Option A", "Option B"] : undefined
    };
    setQuestions([...questions, newQuestion]);
    setSelectedQuestionId(newQuestion.id);
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions(questions.filter(q => q.id !== id));
    if (selectedQuestionId === id) setSelectedQuestionId(null);
  };

  const handleUpdateQuestion = (updated: Partial<Question>) => {
    if (!selectedQuestionId) return;
    setQuestions(questions.map(q => q.id === selectedQuestionId ? { ...q, ...updated } as Question : q));
  };

  const handleSaveChanges = async () => {
    if (!activeTemplateId) return;
    setError("");
    setSuccessMessage("");
    try {
      const response = await fetch(`/api/questionnaire-templates/${activeTemplateId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          Questions_JSON: JSON.stringify(questions)
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save template");
      }
      setSuccessMessage("Changes saved successfully to Airtable!");
      setTimeout(() => setSuccessMessage(""), 3000);
      
      // Update local templates cache
      setTemplates(templates.map(t => t.id === activeTemplateId ? { ...t, Questions_JSON: JSON.stringify(questions) } : t));
    } catch (err: any) {
      setError(err.message || "Unable to save adjustments.");
    }
  };

  const handleDuplicate = async () => {
    if (!activeTemplateId) return;
    setError("");
    try {
      const response = await fetch(`/api/questionnaire-templates/${activeTemplateId}/duplicate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${auth.token}` }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to duplicate template");
      }
      setSuccessMessage("Template cloned successfully!");
      setTimeout(() => setSuccessMessage(""), 3000);
      fetchTemplates(data.template.id);
    } catch (err: any) {
      setError(err.message || "Failed to clone template.");
    }
  };

  const handleCreateNewTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName) return;

    setError("");
    try {
      const response = await fetch("/api/questionnaire-templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          Name: newTemplateName,
          Description: newTemplateDesc,
          Industry: newTemplateIndustry,
          Questions_JSON: "[]",
          Branching_Rules_JSON: "[]"
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create template");
      }
      setIsNewTemplateModalOpen(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      fetchTemplates(data.template.id);
    } catch (err: any) {
      setError(err.message || "Failed to create custom template.");
    }
  };

  const handleGenerateAiQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobDescription) return;

    setAiGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${auth.token}`
        },
        body: JSON.stringify({
          jobDescription,
          industry: aiIndustry
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate questions");
      }
      
      setQuestions([...questions, ...data.questions]);
      setIsAiModalOpen(false);
      setJobDescription("");
      setSuccessMessage(data.warning || "AI questions successfully appended!");
      setTimeout(() => setSuccessMessage(""), 3500);
    } catch (err: any) {
      setError(err.message || "Failed to call OpenAI.");
    } finally {
      setAiGenerating(false);
    }
  };

  const selectedQuestion = questions.find(q => q.id === selectedQuestionId);
  const activeTemplate = templates.find(t => t.id === activeTemplateId);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      {/* Top Builder Toolbar */}
      <div className="bg-card border-b border-border px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-xl">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display">Questionnaire Builder</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">Active Template:</span>
              {loading ? (
                <span className="text-xs text-muted-foreground">Loading...</span>
              ) : (
                <select
                  value={activeTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className="bg-secondary/60 hover:bg-secondary border border-border text-xs px-2 py-0.5 rounded font-bold text-primary focus:outline-none"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.Name} {t.Is_System_Template ? "🔒" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* View Toggles */}
        <div className="flex items-center gap-3">
          <div className="bg-secondary p-1 rounded-xl flex border border-border">
            <button
              onClick={() => setActiveTab("edit")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "edit" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Canvas
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "preview" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab("flow")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === "flow" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Logic Map
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsNewTemplateModalOpen(true)}
              className="p-2 border border-border hover:bg-secondary rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
              title="Create Custom Template"
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            <button 
              onClick={handleDuplicate}
              className="p-2 border border-border hover:bg-secondary rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
              title="Clone Template"
              disabled={!activeTemplateId}
            >
              <Copy className="w-4 h-4" />
            </button>

            <button 
              onClick={handleSaveChanges}
              disabled={activeTemplate?.Is_System_Template}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      {/* Status banner alerts */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-xs py-2 px-6 border-b border-destructive/20 font-medium">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-green-500/10 text-green-600 text-xs py-2 px-6 border-b border-green-500/20 font-medium">
          {successMessage}
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "edit" ? (
          <>
            {/* Left Panel: Draggable Question Types Palette */}
            <div className="w-64 bg-card border-r border-border p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Add Question Types</h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {[
                    { type: "short_text", name: "Short Text" },
                    { type: "long_text", name: "Long Text" },
                    { type: "rating", name: "Rating Star" },
                    { type: "yes_no", name: "Yes / No" },
                    { type: "multiple_choice", name: "Checkbox Multi" },
                    { type: "single_select", name: "Radio Selection" },
                    { type: "dropdown", name: "Dropdown Select" },
                    { type: "section_heading", name: "Section Heading" },
                  ].map((btn) => (
                    <button
                      key={btn.type}
                      onClick={() => handleAddQuestion(btn.type as Question["type"])}
                      disabled={activeTemplate?.Is_System_Template}
                      className="flex items-center justify-between p-3 border border-border bg-card hover:bg-secondary rounded-xl text-left text-xs font-semibold transition-all group cursor-pointer disabled:opacity-40"
                    >
                      <span>{btn.name}</span>
                      <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Question Generator
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Generate questions from a Job Description via GPT-4o.
                </p>
                <button 
                  onClick={() => setIsAiModalOpen(true)}
                  disabled={activeTemplate?.Is_System_Template}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-primary text-primary-foreground font-semibold rounded-lg text-[10px] hover:opacity-90 transition-all cursor-pointer mt-1 disabled:opacity-50"
                >
                  Launch Generator
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Central Panel: Question Canvas List */}
            <div className="flex-1 bg-secondary/20 p-8 overflow-y-auto space-y-4">
              {activeTemplate?.Is_System_Template && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-xs text-amber-600 font-medium">
                  🔒 System Templates are read-only. Click the <strong>Copy icon</strong> in the top toolbar to duplicate it and create a custom editable version.
                </div>
              )}

              {questions.length > 0 ? (
                questions.map((q, idx) => (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuestionId(q.id)}
                    className={`bg-card p-5 border rounded-2xl shadow-xs transition-all cursor-pointer relative group ${
                      selectedQuestionId === q.id 
                        ? "border-primary ring-2 ring-primary/10" 
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                            Q{idx + 1} • {q.type.replace("_", " ").toUpperCase()}
                          </span>
                          {q.required && (
                            <span className="text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded font-bold">
                              Required
                            </span>
                          )}
                          {q.risk_rule && (
                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
                              Risk Flag
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-semibold text-foreground">{q.label}</h4>
                        {q.description && (
                          <p className="text-xs text-muted-foreground">{q.description}</p>
                        )}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQuestion(q.id);
                        }}
                        disabled={activeTemplate?.Is_System_Template}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-all disabled:hidden"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="border-2 border-dashed border-border p-12 text-center rounded-2xl text-muted-foreground flex flex-col items-center justify-center h-48 bg-card">
                  <PlusCircle className="w-8 h-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm">No questions in this template yet.</p>
                  <p className="text-xs mt-1">Select card components from the sidebar to populate.</p>
                </div>
              )}
            </div>

            {/* Right Panel: Settings Editor */}
            <div className="w-80 bg-card border-l border-border p-6 overflow-y-auto space-y-6">
              {selectedQuestion ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question Settings</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Customize properties for ID: {selectedQuestion.id}</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Question Label
                      </label>
                      <textarea
                        value={selectedQuestion.label}
                        disabled={activeTemplate?.Is_System_Template}
                        onChange={(e) => handleUpdateQuestion({ label: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 h-16 resize-none disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        Description / Helpers
                      </label>
                      <input
                        type="text"
                        value={selectedQuestion.description}
                        disabled={activeTemplate?.Is_System_Template}
                        onChange={(e) => handleUpdateQuestion({ description: e.target.value })}
                        className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-4">
                      <span className="text-xs font-semibold">Mark Required</span>
                      <input
                        type="checkbox"
                        checked={selectedQuestion.required}
                        disabled={activeTemplate?.Is_System_Template}
                        onChange={(e) => handleUpdateQuestion({ required: e.target.checked })}
                        className="w-4 h-4 text-primary bg-secondary border-border rounded focus:ring-primary/20 disabled:opacity-50"
                      />
                    </div>

                    {/* Risk Rules Settings */}
                    <div className="border-t border-border pt-4 space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Risk Flag rules</span>
                      <div className="p-3 bg-secondary rounded-xl space-y-3 border border-border">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Auto-flag alerts</span>
                          <input
                            type="checkbox"
                            checked={!!selectedQuestion.risk_rule}
                            disabled={activeTemplate?.Is_System_Template}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleUpdateQuestion({ risk_rule: { condition: "equals", value: "no", severity: "high" } });
                              } else {
                                handleUpdateQuestion({ risk_rule: undefined });
                              }
                            }}
                            className="w-4 h-4 text-primary bg-secondary border-border rounded focus:ring-primary/20 disabled:opacity-50"
                          />
                        </div>

                        {selectedQuestion.risk_rule && (
                          <div className="space-y-2 pt-1 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">IF value equals:</span>
                              <input
                                type="text"
                                value={selectedQuestion.risk_rule.value}
                                disabled={activeTemplate?.Is_System_Template}
                                onChange={(e) => handleUpdateQuestion({ 
                                  risk_rule: { ...selectedQuestion.risk_rule!, value: e.target.value } 
                                })}
                                className="w-20 px-2 py-1 bg-card border border-border rounded text-[11px] disabled:opacity-50"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">Severity:</span>
                              <select
                                value={selectedQuestion.risk_rule.severity}
                                disabled={activeTemplate?.Is_System_Template}
                                onChange={(e) => handleUpdateQuestion({
                                  risk_rule: { ...selectedQuestion.risk_rule!, severity: e.target.value as "high" | "medium" }
                                })}
                                className="bg-card border border-border px-1.5 py-0.5 rounded text-[11px] disabled:opacity-50"
                              >
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground text-xs py-12 flex flex-col items-center justify-center h-full">
                  <Play className="w-6 h-6 text-muted-foreground/30 mb-2 rotate-90" />
                  Select a question card on the canvas to configure settings.
                </div>
              )}
            </div>
          </>
        ) : activeTab === "preview" ? (
          /* Referee Facing Form Live Preview Mode */
          <div className="flex-1 bg-secondary/10 overflow-y-auto p-8 flex justify-center">
            <div className="bg-card border border-border p-8 rounded-2xl max-w-xl w-full shadow-sm space-y-6 self-start">
              <div className="border-b border-border pb-4">
                <span className="text-[10px] font-bold text-primary tracking-wider uppercase bg-primary/10 px-2 py-0.5 rounded">
                  Referee Form Preview
                </span>
                <h2 className="text-lg font-bold font-display mt-2">Professional Reference Questionnaire</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Please provide honest and objective feedback.</p>
              </div>

              <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                {questions.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {q.label} {q.required && <span className="text-destructive">*</span>}
                    </label>
                    {q.description && (
                      <p className="text-[11px] text-muted-foreground italic leading-none">{q.description}</p>
                    )}

                    {q.type === "short_text" && (
                      <input
                        type="text"
                        required={q.required}
                        className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    )}

                    {q.type === "long_text" && (
                      <textarea
                        required={q.required}
                        rows={3}
                        className="w-full px-4 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    )}

                    {q.type === "yes_no" && (
                      <div className="flex gap-4">
                        {["Yes", "No"].map((opt) => (
                          <label key={opt} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                            <input
                              type="radio"
                              name={q.id}
                              value={opt.toLowerCase()}
                              onChange={(e) => setPreviewAnswers({ ...previewAnswers, [q.id]: e.target.value })}
                              className="w-4 h-4 text-primary bg-secondary border-border focus:ring-primary/20"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    )}

                    {q.type === "rating" && (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            className="w-8 h-8 rounded-lg bg-secondary hover:bg-primary/10 border border-border flex items-center justify-center font-bold text-xs hover:text-primary transition-all cursor-pointer"
                          >
                            {star}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all cursor-pointer"
                >
                  Submit Questionnaire Responses
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Logic Flow Node Viewer Map */
          <div className="flex-1 bg-secondary/15 flex items-center justify-center p-8">
            <div className="bg-card border border-border p-6 rounded-2xl max-w-lg w-full text-center space-y-4 shadow-sm">
              <div className="flex items-center justify-center bg-primary/10 text-primary w-12 h-12 rounded-full mx-auto">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold font-display">Branching & Logic Map</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Visual node map representation of conditional questions branching.
              </p>
              
              <div className="border border-border rounded-xl p-4 bg-secondary/40 text-left space-y-3 font-mono text-[10px]">
                {questions.map((q, idx) => (
                  <div key={q.id} className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground px-1.5 py-0.5 rounded uppercase">{q.type.replace("_", " ")}</span>
                    <span>q_{idx+1}: {q.label.substring(0, 30)}...</span>
                    {q.risk_rule && (
                      <span className="text-destructive font-bold">🚨 Risk flag rule active</span>
                    )}
                  </div>
                ))}
              </div>

              <span className="text-[10px] text-muted-foreground block">
                Visual flow nodes render dynamically mapping logic pathways.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* AI Questionnaire Generator Modal */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsAiModalOpen(false)}></div>
          
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-primary font-bold font-display">
                <Sparkles className="w-5 h-5" />
                AI Questionnaire Generator
              </div>
              <button onClick={() => setIsAiModalOpen(false)}>
                <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <form onSubmit={handleGenerateAiQuestions} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Target Industry
                </label>
                <select
                  value={aiIndustry}
                  onChange={(e) => setAiIndustry(e.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-xs font-semibold focus:outline-none"
                >
                  <option value="General">General Corporate</option>
                  <option value="ECE">ECE / Childcare</option>
                  <option value="Healthcare">Healthcare / Clinical</option>
                  <option value="Trades">Trades & Construction</option>
                  <option value="Technology">Technology / Engineering</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Paste Job Description (JD) *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Paste the role requirements, credentials, and responsibilities here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-xl text-xs focus:outline-none h-40 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={aiGenerating}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {aiGenerating ? "Generating compliance questions..." : "Generate & Append Questions"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Custom Template Modal */}
      {isNewTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsNewTemplateModalOpen(false)}></div>
          
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="font-bold font-display text-sm">Create Custom Reference Package</span>
              <button onClick={() => setIsNewTemplateModalOpen(false)}>
                <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <form onSubmit={handleCreateNewTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Template Package Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Qualified Teacher Standard"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Industry
                </label>
                <select
                  value={newTemplateIndustry}
                  onChange={(e) => setNewTemplateIndustry(e.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-xs font-semibold focus:outline-none"
                >
                  <option value="General">General</option>
                  <option value="ECE">ECE</option>
                  <option value="Healthcare">Healthcare</option>
                  <option value="Trades">Trades</option>
                  <option value="Technology">Technology</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Internal Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard NZTC compliance reference set"
                  value={newTemplateDesc}
                  onChange={(e) => setNewTemplateDesc(e.target.value)}
                  className="w-full px-3 py-2.5 bg-secondary border border-border rounded-xl text-xs focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:opacity-90 shadow-md shadow-primary/10 transition-all cursor-pointer"
              >
                Create Questionnaire
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
