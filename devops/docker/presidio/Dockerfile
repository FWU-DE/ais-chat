FROM mcr.microsoft.com/presidio-analyzer:latest

# The stock image only ships the English spaCy model; add the German NER model
RUN python -m spacy download de_core_news_lg

COPY analyzer-conf.yaml nlp-conf.yaml recognizer-registry-conf.yaml /app/conf/

ENV ANALYZER_CONF_FILE=/app/conf/analyzer-conf.yaml
ENV NLP_CONF_FILE=/app/conf/nlp-conf.yaml
ENV RECOGNIZER_REGISTRY_CONF_FILE=/app/conf/recognizer-registry-conf.yaml
