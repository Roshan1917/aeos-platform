{{/*
Common helpers for the telemetry Helm chart.
*/}}

{{- define "telemetry.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "telemetry.fullname" -}}
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

{{- define "telemetry.labels" -}}
app.kubernetes.io/name: {{ include "telemetry.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- with .Values.podLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "telemetry.selectorLabels" -}}
app.kubernetes.io/name: {{ include "telemetry.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
