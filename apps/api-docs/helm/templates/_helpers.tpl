{{/* Common helpers for the @aeos/api-docs Helm chart. */}}

{{- define "api-docs.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "api-docs.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{ .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{ .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{ printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "api-docs.labels" -}}
app.kubernetes.io/name: {{ include "api-docs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- with .Values.labels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "api-docs.selectorLabels" -}}
app.kubernetes.io/name: {{ include "api-docs.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
