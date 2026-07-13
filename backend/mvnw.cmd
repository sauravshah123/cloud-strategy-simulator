@REM Maven Wrapper Windows batch file
@IF "%__MVNW_ARG0_NAME__%"=="MVNW_USERNAME" (SET "MVNW_USERNAME=%__MVNW_ARG0_VALUE__%")
@SET MAVEN_PROJECTBASEDIR=%~dp0
@FOR /F "usebackq tokens=1,2 delims==" %%a IN ("%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.properties") DO @(
  IF "%%a"=="distributionUrl" SET DISTRIBUTION_URL=%%b
)
@SET JAVA_HOME_SETTING=%JAVA_HOME%
@java -jar "%MAVEN_PROJECTBASEDIR%\.mvn\wrapper\maven-wrapper.jar" %MAVEN_PROJECTBASEDIR% %*
